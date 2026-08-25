// AI 建議的領域規則。純函式：回傳格式、提示詞、以及「只填空位」的合併邏輯。
// 這裡不 import 任何 SDK——呼叫模型是 app/ai-actions.ts 的事。
// 決策見 docs/decisions/0012-ai-suggestions.md。
import { z } from "zod";
import { SLOTS } from "./mandala.ts";

/**
 * 模型回傳的一個次目標建議。
 *
 * `why` 不是裝飾：使用者要決定採不採用，就得知道這一塊為什麼存在。
 * 沒有它，八個標題只是八個看起來都合理的名詞。
 */
export const subGoalSuggestion = z.object({
  title: z.string().trim().min(1).max(40),
  why: z.string().trim().min(1).max(120),
});

export const subGoalSuggestions = z.object({
  subGoals: z.array(subGoalSuggestion),
});

export type SubGoalSuggestion = z.infer<typeof subGoalSuggestion>;

/**
 * 給模型看的輸出格式，手寫而不是從上面的 Zod 產生。
 *
 * 兩個原因。一是 Gemini 只吃 JSON Schema 的一個子集（`type`／`properties`／`required`／
 * `items`／`minItems`／`maxItems`／`propertyOrdering` 那些），字數限制的 `minLength`
 * 與 `maxLength` 不在支援清單上，直接丟 `z.toJSONSchema()` 的產物過去是在賭。
 * 二是這兩份東西本來就在回答不同問題：**這一份是給模型的提示，上面那份才是關卡。**
 * 模型可以無視這裡的任何一個字，Zod 那關過不了就是不收。
 */
export const subGoalResponseSchema = {
  type: "object",
  properties: {
    subGoals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "次目標名稱，2 到 8 個字" },
          why: { type: "string", description: "一句話說明這一塊為什麼值得佔掉八分之一的版面" },
        },
        required: ["title", "why"],
        propertyOrdering: ["title", "why"],
      },
    },
  },
  required: ["subGoals"],
} as const;

/**
 * 還空著的次目標位置，由小到大。
 *
 * **這是「不覆蓋」的唯一實作。** CLAUDE.md 的第一優先序是歷史不能被覆蓋，
 * 而次目標的 upsert 是照 position 寫的——建議如果寫到已經有內容的位置，
 * 會連同底下 8 項行為與所有打卡紀錄一起失去意義。
 */
export function freeSlots(taken: readonly number[]): number[] {
  const used = new Set(taken);
  return Array.from({ length: SLOTS }, (_, i) => i).filter((i) => !used.has(i));
}

/**
 * 把建議依序放進空位。多的建議直接丟掉，不會擠掉任何既有內容。
 * 建議比空位少也沒關係，填得了幾格算幾格。
 */
export function assignToFreeSlots<T>(taken: readonly number[], suggestions: readonly T[]): { position: number; value: T }[] {
  const free = freeSlots(taken);
  return free.slice(0, suggestions.length).map((position, i) => ({ position, value: suggestions[i]! }));
}

/**
 * 給模型的提示詞。
 *
 * 三件事一定要講，少一件產出就會歪：
 * 1. 次目標是**面向**不是**步驟**。不講的話會拿到「第一個月…第二個月…」，
 *    那是時程表不是曼陀羅——曼陀羅的八塊要能同時進行。
 * 2. 每一塊底下要放得下 8 項具體行為。放不下代表這塊太細或太抽象。
 * 3. 用跟核心目標同一種語言回答。使用者用中文寫目標，不該收到英文的次目標。
 */
export function subGoalPrompt(input: {
  coreGoal: string;
  existing: { position: number; title: string }[];
  need: number;
}): string {
  const { coreGoal, existing, need } = input;
  const already = existing.length
    ? `\n這張表已經有這幾塊了，不要重複、也不要只是換句話說：\n${existing.map((e) => `- ${e.title}`).join("\n")}\n`
    : "";

  return `你在幫人填曼陀羅計劃表（Mandal-Art）。這種表把一個核心目標拆成 8 個次目標，
每個次目標再拆成 8 項具體行為，總共 64 格。

核心目標：${coreGoal}
${already}
請提出 ${need} 個次目標。規則：

- 次目標是**面向**，不是**步驟**。八塊要能同時推進，不是「第一階段、第二階段」。
  如果你的答案讀起來像時程表，就是錯的。
- 每一塊底下要放得下 8 項具體、可執行、能重複做的行為。放不下代表這塊太細；
  想不出具體行為代表這塊太抽象。
- 八塊合起來要涵蓋達成核心目標真正需要的東西，包含容易被忽略的那些
  （例如休息、環境、心態、支援系統），不要八塊都在講同一件事的不同說法。
- 名稱簡短，2 到 8 個字，是一個名詞或動名詞，不是一個句子。
- **用跟核心目標同一種語言回答。**

每一塊附一句 why，說明為什麼這一塊值得佔掉八分之一的版面。寫給填表的人看，不是寫給我看。`;
}

/* ---------- 第二步：某個次目標底下的 8 項行為 ---------- */

/**
 * 模型回傳的一項行為建議。
 *
 * 刻意寫成**扁平**的：`cadence`／`timesPerPeriod` 與 `target` 各自只對一種 trackingType 有意義，
 * 但 Gemini 吃的 JSON Schema 子集不含 `oneOf` 的可靠支援，硬要 discriminated union
 * 是在賭。所以模型端收寬的，收下來之後用 normalizeAction 收斂，
 * 最後寫入時再過 lib/schemas.ts 的 actionInput——那才是真正的關卡。
 */
export const actionSuggestion = z.object({
  title: z.string().trim().min(1).max(60),
  trackingType: z.enum(["habit", "quota", "milestone", "mantra"]),
  cadence: z.enum(["daily", "weekly", "monthly"]).nullish(),
  timesPerPeriod: z.number().int().min(1).max(99).nullish(),
  target: z.number().int().positive().nullish(),
  why: z.string().trim().min(1).max(120),
});

export const actionSuggestions = z.object({ actions: z.array(actionSuggestion) });

export type ActionSuggestion = z.infer<typeof actionSuggestion>;

/** 收斂後的形狀，欄位組合已經跟 trackingType 對齊。 */
export type NormalizedAction = {
  title: string;
  why: string;
  trackingType: ActionSuggestion["trackingType"];
  cadence: "daily" | "weekly" | "monthly" | null;
  timesPerPeriod: number | null;
  target: number | null;
};

/**
 * 把模型給的扁平資料收斂成合法的組合。收不了的回 null，由呼叫端丟掉。
 *
 * 為什麼要有這一步：模型很容易給出「里程碑 + 每日」這種矛盾組合，
 * 直接送進 actionInput 會整批驗證失敗。與其讓一顆壞蘋果毀掉整籃，
 * 不如在這裡把多餘的欄位清掉——那些欄位對該型態本來就沒有意義。
 *
 * **唯一收不了的是「累計型沒給目標數量」**：那個數字沒辦法猜，
 * 猜錯會讓進度百分比從第一天就是錯的（見 decisions/0008）。
 */
export function normalizeAction(s: ActionSuggestion): NormalizedAction | null {
  const base = { title: s.title, why: s.why };
  switch (s.trackingType) {
    case "habit":
      // 頻率沒給就當每日。這個預設是安全的：分母變大只會讓進度看起來保守。
      // 次數沒給就當一次，同理。
      return {
        ...base,
        trackingType: "habit",
        cadence: s.cadence ?? "daily",
        timesPerPeriod: s.timesPerPeriod ?? 1,
        target: null,
      };
    case "quota":
      if (!s.target || s.target <= 0) return null;
      return { ...base, trackingType: "quota", cadence: null, timesPerPeriod: null, target: s.target };
    case "milestone":
    case "mantra":
      return { ...base, trackingType: s.trackingType, cadence: null, timesPerPeriod: null, target: null };
  }
}

/** 給模型的輸出格式。理由與 subGoalResponseSchema 相同：手寫，只用 Gemini 支援的關鍵字。 */
export const actionResponseSchema = {
  type: "object",
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "具體行為，10 到 20 個字，看得出今天有沒有做到" },
          trackingType: {
            type: "string",
            enum: ["habit", "quota", "milestone", "mantra"],
            description: "habit=固定頻率重複做；quota=朝一個總量前進；milestone=做完一次就結束；mantra=銘記在心不追蹤",
          },
          cadence: { type: "string", enum: ["daily", "weekly", "monthly"], description: "只有 habit 要填" },
          timesPerPeriod: { type: "integer", description: "只有 habit 要填，一期要做幾次，預設 1" },
          target: { type: "integer", description: "只有 quota 要填，是一個正整數的總量" },
          why: { type: "string", description: "一句話說明這一項為什麼有用" },
        },
        required: ["title", "trackingType", "why"],
        propertyOrdering: ["title", "trackingType", "cadence", "timesPerPeriod", "target", "why"],
      },
    },
  },
  required: ["actions"],
} as const;

/**
 * 給模型的提示詞。四種追蹤方式的定義照抄 decisions/0008——
 * 那份定義是這個 app 的核心規則，不能在這裡自己發明另一套說法。
 *
 * 特別要求「不要八項都是習慣」：信念型是曼陀羅裡最容易被忽略、
 * 但價值最高的一格。不講的話模型會給你八個打卡項目。
 */
export function actionPrompt(input: {
  coreGoal: string;
  subGoal: string;
  existing: { position: number; title: string }[];
  need: number;
}): string {
  const { coreGoal, subGoal, existing, need } = input;
  const already = existing.length
    ? `\n這一塊已經有這幾項了，不要重複：\n${existing.map((e) => `- ${e.title}`).join("\n")}\n`
    : "";

  return `你在幫人填曼陀羅計劃表（Mandal-Art）。核心目標拆成 8 個次目標，
每個次目標再拆成 8 項具體行為。

核心目標：${coreGoal}
現在要填的次目標：${subGoal}
${already}
請提出 ${need} 項具體行為。每一項都要標上追蹤方式，四選一：

- **habit** 固定頻率重複做的事。要附 cadence：daily／weekly／monthly，
  一期要做不只一次就附 timesPerPeriod。
  例：「每週跑 3 次」→ habit + weekly + timesPerPeriod 3（**不是** daily）。
  例：「每週跑一次 15 公里以上」→ habit + weekly。
- **quota** 朝一個總量前進。要附 target（正整數）。
  例：「累積跑滿 800 公里」→ quota + target 800。
- **milestone** 做完一次就結束。
  例：「完成一次半程馬拉松」→ milestone。
- **mantra** 銘記在心、不追蹤進度的原則。
  例：「痛就停，不要逞強」→ mantra。

規則：

- 行為要**具體到今天結束時，你能明確回答有沒有做到**。
  「加強核心」不行，「做 3 組棒式各 60 秒」可以。
- **不要八項都是習慣。** 八項裡至少要有一項 mantra——那是這一塊的原則，
  是做決定時的依據，不是待辦事項。也想想有沒有適合的里程碑或累計目標。
- 名稱 10 到 20 個字，短到能塞進一個小格子。
- **用跟核心目標同一種語言回答。**

每一項附一句 why，寫給填表的人看。`;
}
