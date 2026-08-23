import assert from "node:assert/strict";
import { test } from "node:test";
import {
  actionPrompt, actionSuggestions, assignToFreeSlots, freeSlots, normalizeAction,
  subGoalPrompt, subGoalSuggestions, type ActionSuggestion,
} from "./suggest.ts";
import { actionInput } from "./schemas.ts";

test("空的計劃表八格全空", () => {
  assert.deepEqual(freeSlots([]), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test("已經填過的位置不會被算成空位", () => {
  assert.deepEqual(freeSlots([0, 3, 7]), [1, 2, 4, 5, 6]);
  assert.deepEqual(freeSlots([0, 1, 2, 3, 4, 5, 6, 7]), []);
});

test("建議只會落在空位上，一格既有內容都不會被擠掉", () => {
  const placed = assignToFreeSlots([1, 4], ["A", "B", "C"]);
  assert.deepEqual(placed, [
    { position: 0, value: "A" },
    { position: 2, value: "B" },
    { position: 3, value: "C" },
  ]);
  assert.equal(placed.some((p) => p.position === 1 || p.position === 4), false);
});

test("建議比空位多就丟掉多的，不會溢出到別的位置", () => {
  const placed = assignToFreeSlots([0, 1, 2, 3, 4, 5], ["A", "B", "C", "D"]);
  assert.deepEqual(placed.map((p) => p.position), [6, 7]);
  assert.deepEqual(placed.map((p) => p.value), ["A", "B"]);
});

test("全滿的表拿到建議也不會寫進去任何一格", () => {
  assert.deepEqual(assignToFreeSlots([0, 1, 2, 3, 4, 5, 6, 7], ["A", "B"]), []);
});

test("建議比空位少就填得了幾格算幾格", () => {
  assert.deepEqual(assignToFreeSlots([], ["A"]), [{ position: 0, value: "A" }]);
});

test("模型的回傳要過 Zod，空標題與超長都擋下來", () => {
  assert.equal(subGoalSuggestions.safeParse({ subGoals: [{ title: "閱讀", why: "打底" }] }).success, true);
  assert.equal(subGoalSuggestions.safeParse({ subGoals: [{ title: "  ", why: "x" }] }).success, false);
  assert.equal(subGoalSuggestions.safeParse({ subGoals: [{ title: "閱讀" }] }).success, false, "少了 why 就是壞資料");
  assert.equal(
    subGoalSuggestions.safeParse({ subGoals: [{ title: "閱".repeat(41), why: "x" }] }).success,
    false,
    "標題塞不進格子就不該收",
  );
});

test("標題前後空白會被去掉，不會寫進資料庫", () => {
  const parsed = subGoalSuggestions.parse({ subGoals: [{ title: "  閱讀  ", why: " 打底 " }] });
  assert.equal(parsed.subGoals[0]!.title, "閱讀");
  assert.equal(parsed.subGoals[0]!.why, "打底");
});

test("提示詞帶上核心目標、要幾個、以及已經有的那幾塊", () => {
  const p = subGoalPrompt({
    coreGoal: "2027 年底考到雅思 8 分",
    existing: [{ position: 0, title: "閱讀" }],
    need: 7,
  });
  assert.ok(p.includes("2027 年底考到雅思 8 分"));
  assert.ok(p.includes("7 個次目標"));
  assert.ok(p.includes("閱讀"), "已經有的要講給模型聽，不然會生出重複的");
});

test("一格都沒填時，提示詞不要出現空的「已經有這幾塊」段落", () => {
  const p = subGoalPrompt({ coreGoal: "跑完全馬", existing: [], need: 8 });
  assert.equal(p.includes("已經有這幾塊"), false);
});

/* ---------- 行為建議 ---------- */

const act = (o: Partial<ActionSuggestion> & { trackingType: ActionSuggestion["trackingType"] }): ActionSuggestion =>
  ({ title: "做一件事", why: "有用", cadence: null, target: null, ...o });

test("習慣型沒給頻率就當每日，不是丟掉", () => {
  const n = normalizeAction(act({ trackingType: "habit" }));
  assert.equal(n?.cadence, "daily");
  assert.equal(n?.target, null);
});

test("習慣型有給頻率就照用", () => {
  assert.equal(normalizeAction(act({ trackingType: "habit", cadence: "weekly" }))?.cadence, "weekly");
});

test("累計型沒有目標數量就收不了——那個數字猜不得", () => {
  assert.equal(normalizeAction(act({ trackingType: "quota" })), null);
  assert.equal(normalizeAction(act({ trackingType: "quota", target: 0 })), null);
  assert.equal(normalizeAction(act({ trackingType: "quota", target: 800 }))?.target, 800);
});

test("矛盾的欄位組合會被清掉，不會整批驗證失敗", () => {
  // 模型很愛給「里程碑 + 每日」這種東西
  const m = normalizeAction(act({ trackingType: "milestone", cadence: "daily", target: 5 }));
  assert.deepEqual(m, { title: "做一件事", why: "有用", trackingType: "milestone", cadence: null, target: null });
  const q = normalizeAction(act({ trackingType: "mantra", cadence: "weekly", target: 3 }));
  assert.equal(q?.cadence, null);
  assert.equal(q?.target, null);
});

test("收斂後的組合要能通過真正的關卡 actionInput", () => {
  for (const s of [
    act({ trackingType: "habit", cadence: "weekly" }),
    act({ trackingType: "quota", target: 800 }),
    act({ trackingType: "milestone" }),
    act({ trackingType: "mantra" }),
  ]) {
    const n = normalizeAction(s);
    assert.ok(n, `${s.trackingType} 應該收得了`);
    const parsed = actionInput.safeParse({
      subGoalId: "sg", position: 0, title: n!.title,
      trackingType: n!.trackingType, cadence: n!.cadence, target: n!.target,
    });
    assert.equal(parsed.success, true, `${s.trackingType} 收斂後仍過不了 actionInput`);
  }
});

test("模型的行為回傳要過 Zod：型態要在四選一之內", () => {
  assert.equal(actionSuggestions.safeParse({ actions: [act({ trackingType: "habit" })] }).success, true);
  assert.equal(
    actionSuggestions.safeParse({ actions: [{ title: "x", why: "y", trackingType: "percent" }] }).success,
    false,
    "已經廢掉的舊型態不能混進來",
  );
  assert.equal(
    actionSuggestions.safeParse({ actions: [{ title: "x", why: "y", trackingType: "quota", target: -5 }] }).success,
    false,
    "負的目標數量要在 Zod 就擋掉",
  );
});

test("行為的提示詞帶上核心目標、這一塊的名字、要幾項", () => {
  const p = actionPrompt({ coreGoal: "跑完全馬", subGoal: "肌力訓練", existing: [], need: 8 });
  assert.ok(p.includes("跑完全馬"));
  assert.ok(p.includes("肌力訓練"));
  assert.ok(p.includes("8 項"));
  assert.ok(p.includes("mantra"), "四種型態要講給模型聽，否則它只會給習慣");
});
