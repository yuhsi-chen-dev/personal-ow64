"use server";

import { GoogleGenAI } from "@google/genai";
import type { z } from "zod";
import { requireUserId } from "@/auth.ts";
import { loadPlan } from "@/db/queries.ts";
import { SLOTS } from "@/lib/mandala.ts";
import {
  actionPrompt, actionResponseSchema, actionSuggestions, assignToFreeSlots, freeSlots,
  normalizeAction, subGoalPrompt, subGoalResponseSchema, subGoalSuggestions,
  type NormalizedAction,
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
export type ActionSuggestionAt = Suggestion & Omit<NormalizedAction, "title" | "why">;

export type SuggestResult = { suggestions?: Suggestion[]; error?: string };
export type SuggestActionsResult = { suggestions?: ActionSuggestionAt[]; error?: string };

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

/** 模型回了東西，但不是我們能用的東西。跟「連不上」是兩件事，訊息也該不一樣。 */
class BadOutput extends Error {
  constructor(readonly reason: "empty" | "not-json" | "schema") {
    super(`模型輸出不可用：${reason}`);
    this.name = "BadOutput";
  }
}

/**
 * 打一次模型，把輸出過完所有關卡再回傳。任何失敗都丟例外，由呼叫端翻譯。
 *
 * 模型的輸出是跨信任邊界的輸入（decisions/0006），所以 `responseJsonSchema`
 * 只是**給模型的提示**，`schema` 才是關卡——模型有權無視前者。
 */
async function generate<T>(prompt: string, responseJsonSchema: unknown, schema: z.ZodType<T>): Promise<T> {
  const config = { responseMimeType: "application/json", responseJsonSchema };

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
  if (!text) throw new BadOutput("empty");

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BadOutput("not-json");
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new BadOutput("schema");
  return parsed.data;
}

/** 錯誤翻成使用者看得懂的一句話。不要把原始訊息漏到畫面上。 */
function explain(e: unknown): string {
  if (e instanceof BadOutput) return "AI 這次沒有給出可用的建議，再試一次。";
  const msg = e instanceof Error ? e.message : "";
  if (msg.includes("GEMINI_API_KEY")) return "這台機器還沒設定 AI 的金鑰。";
  if (/API key|401|403|PERMISSION/i.test(msg)) return "AI 的金鑰無效或沒有權限。";
  if (/429|quota|RESOURCE_EXHAUSTED/i.test(msg)) return "今天的 AI 免費額度用完了，明天再試。";
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

  try {
    const out = await generate(
      subGoalPrompt({
        coreGoal: data.plan.title,
        existing: data.subGoals.map((s) => ({ position: s.position, title: s.title })),
        need,
      }),
      subGoalResponseSchema,
      subGoalSuggestions,
    );
    if (out.subGoals.length === 0) return { error: "AI 這次沒有給出可用的建議，再試一次。" };

    // position 由這裡決定：只落在空位上，多的丟掉。見 lib/suggest.ts 的 assignToFreeSlots。
    return {
      suggestions: assignToFreeSlots(taken, out.subGoals.slice(0, SLOTS)).map(({ position, value }) => ({
        position,
        title: value.title,
        why: value.why,
      })),
    };
  } catch (e) {
    // 使用者只看得到 explain() 的一句話，但伺服器這邊要留下原文。
    // 沒有這行的話，線上出問題時完全沒有東西可查——吞掉的錯誤等於沒發生過。
    console.error("[suggestSubGoals]", e);
    return { error: explain(e) };
  }
}

/**
 * 請模型提出某個次目標底下的行為。一樣只提出，不寫入。
 *
 * 模型很容易給出矛盾的欄位組合（「里程碑 + 每日」），所以每一項都先過
 * normalizeAction 收斂；收不了的直接丟掉，不讓一顆壞蘋果毀掉整籃。
 */
export async function suggestActions(planId: string, slot: number): Promise<SuggestActionsResult> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "請先登入" };
  }

  const data = await loadPlan(userId, planId);
  if (!data) return { error: "找不到，或不屬於你" };

  const subGoal = data.subGoals.find((s) => s.position === slot);
  if (!subGoal) return { error: "要先填好這個次目標，才能請 AI 想底下的行為。" };

  const mine = data.actions.filter((a) => a.subGoalId === subGoal.id);
  const taken = mine.map((a) => a.position);
  const need = freeSlots(taken).length;
  if (need === 0) return { error: "這一塊的八項行為都填滿了，沒有空位可以放建議。" };

  try {
    const out = await generate(
      actionPrompt({
        coreGoal: data.plan.title,
        subGoal: subGoal.title,
        existing: mine.map((a) => ({ position: a.position, title: a.title })),
        need,
      }),
      actionResponseSchema,
      actionSuggestions,
    );

    // 收不了的（累計型沒給目標數量）在這裡就消失，寧可少給一格也不要猜一個數字。
    const usable = out.actions.map(normalizeAction).filter((a): a is NormalizedAction => a !== null);
    if (usable.length === 0) return { error: "AI 這次沒有給出可用的建議，再試一次。" };

    return {
      suggestions: assignToFreeSlots(taken, usable.slice(0, SLOTS)).map(({ position, value }) => ({
        position,
        title: value.title,
        why: value.why,
        trackingType: value.trackingType,
        cadence: value.cadence,
        timesPerPeriod: value.timesPerPeriod,
        target: value.target,
      })),
    };
  } catch (e) {
    console.error("[suggestActions]", e);
    return { error: explain(e) };
  }
}
