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
