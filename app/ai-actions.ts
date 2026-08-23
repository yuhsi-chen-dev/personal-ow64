"use server";

import { GoogleGenAI } from "@google/genai";
import { requireUserId } from "@/auth.ts";
import { loadPlan } from "@/db/queries.ts";
import { SLOTS } from "@/lib/mandala.ts";
import {
  assignToFreeSlots, freeSlots, subGoalPrompt, subGoalResponseSchema, subGoalSuggestions,
} from "@/lib/suggest.ts";

/**
 * 用 Gemini 的免費額度，理由與代價見 docs/decisions/0012-ai-suggestions.md。
 * 換 provider 只需要改這一個檔——lib/suggest.ts 完全不知道模型是誰。
 *
 * **別名而不是版號。** 實測 `gemini-2.5-flash` 與 `gemini-2.0-flash` 都已回
 * 404「no longer available」；別名跟著 Google 走，不會這樣死掉。
 *
 * 選 lite 是量出來的（2026-08-23，同一個提示詞）：
 *   gemini-flash-lite-latest  2.5s  ✓
 *   gemini-3.5-flash         10.3s  ✓
 *   gemini-3.6-flash         18.7s  ✓
 *   gemini-flash-latest        503（免費層排不進去）
 * 品質差不多，但 18 秒那個在 Vercel 上是地雷。要換就改這一行。
 */
const MODEL = "gemini-flash-lite-latest";

/** 503 重試一次。lite 只要 2.5 秒，重試的代價比讓使用者看到錯誤小得多。 */
const RETRY_MS = 1200;

/** 一則落在特定位置上的建議。position 由伺服器決定，不讓模型選。 */
export type Suggestion = { position: number; title: string; why: string };
export type SuggestResult = { suggestions?: Suggestion[]; error?: string };

/**
 * 連線延後到第一次呼叫才建立，跟 db/index.ts 的 getDb() 同一個理由：
 * `npm run build` 與 `npm run typecheck` 不該需要 API key。
 * 沒設定就丟錯，不要靜默 fallback 成「假裝沒有 AI 功能」。
 */
let cached: GoogleGenAI | undefined;
function getAi(): GoogleGenAI {
  if (!cached) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY 未設定，見 docs/deploy.md");
    cached = new GoogleGenAI({ apiKey });
  }
  return cached;
}

/** 錯誤翻成使用者看得懂的一句話。不要把原始訊息漏到畫面上。 */
function explain(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  if (msg.includes("GEMINI_API_KEY")) return "這台機器還沒設定 AI 的金鑰。";
  if (/API key|401|403|PERMISSION/i.test(msg)) return "AI 的金鑰無效或沒有權限。";
  if (/429|quota|RESOURCE_EXHAUSTED/i.test(msg)) return "今天的 AI 免費額度用完了，明天再試。";
  // 免費層拿到的是剩餘算力，尖峰時段會排不進去。這是選免費的代價（decisions/0012），
  // 不是設定錯了——訊息要講清楚，不然使用者會以為是自己的問題。
  if (/503|UNAVAILABLE|high demand/i.test(msg)) return "AI 現在太多人用（免費額度常會這樣），過一下再按一次。";
  // 模型別名被下架時 Google 回 404。錯在設定不在使用者，訊息要指得出方向。
  if (/404|not found|NOT_FOUND/i.test(msg)) return `找不到模型「${MODEL}」，可能已經改名或下架。`;
  return "產生建議的時候出了問題，等一下再試。";
}

/**
 * 請模型提出次目標。**只提出，不寫入。**
 *
 * 寫入是使用者按下「採用」之後、走既有的 acceptSubGoals 才發生的——那條路已經有
 * Zod 驗證、擁有權檢查，以及寫入當下重新確認空位。建議不該有第二條捷徑繞過它們。
 */
export async function suggestSubGoals(planId: string): Promise<SuggestResult> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "請先登入" };
  }

  const data = await loadPlan(userId, planId);
  if (!data) return { error: "找不到，或不屬於你" };

  const taken = data.subGoals.map((s) => s.position);
  const need = freeSlots(taken).length;
  if (need === 0) return { error: "八個次目標都填滿了，沒有空位可以放建議。" };

  const prompt = subGoalPrompt({
    coreGoal: data.plan.title,
    existing: data.subGoals.map((s) => ({ position: s.position, title: s.title })),
    need,
  });
  const config = { responseMimeType: "application/json", responseJsonSchema: subGoalResponseSchema };

  try {
    let res;
    try {
      res = await getAi().models.generateContent({ model: MODEL, contents: prompt, config });
    } catch (first) {
      // 免費層拿的是剩餘算力，尖峰時會 503。這是暫時的，等一下再打通常就過了。
      // 只重試 503，其他錯誤（金鑰無效、額度用完）重試也沒用，直接往上丟。
      if (!/503|UNAVAILABLE|high demand/i.test(first instanceof Error ? first.message : "")) throw first;
      await new Promise((r) => setTimeout(r, RETRY_MS));
      res = await getAi().models.generateContent({ model: MODEL, contents: prompt, config });
    }

    const text = res.text;
    if (!text) return { error: "AI 這次沒有回答，再試一次。" };

    // 模型的輸出是跨信任邊界的輸入。JSON 剖析與 Zod 兩關都要過——照 decisions/0006。
    // responseJsonSchema 只是提示，模型有權無視它。
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { error: "AI 回了看不懂的東西，再試一次。" };
    }
    const parsed = subGoalSuggestions.safeParse(raw);
    if (!parsed.success || parsed.data.subGoals.length === 0) {
      return { error: "AI 這次沒有給出可用的建議，再試一次。" };
    }

    // position 由這裡決定：只落在空位上，多的丟掉。見 lib/suggest.ts 的 assignToFreeSlots。
    const suggestions = assignToFreeSlots(taken, parsed.data.subGoals.slice(0, SLOTS)).map(
      ({ position, value }) => ({ position, title: value.title, why: value.why }),
    );
    return { suggestions };
  } catch (e) {
    // 使用者只看得到 explain() 的一句話，但伺服器這邊要留下原文。
    // 沒有這行的話，線上出問題時完全沒有東西可查——吞掉的錯誤等於沒發生過。
    console.error("[suggestSubGoals]", e);
    return { error: explain(e) };
  }
}
