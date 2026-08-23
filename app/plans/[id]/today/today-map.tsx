"use client";

import { useState } from "react";
import { Check, Flag, Flame, Hash, Plus, Quote, Repeat, Sunrise } from "lucide-react";
import { ActionForm } from "@/app/action-form.tsx";
import { logProgress } from "@/app/actions.ts";
import { useToday } from "@/app/use-today.ts";
import { buildBoard, streak, toBlocks, type BoardAction, type BoardSubGoal, type Cell } from "@/lib/board.ts";
import type { Cadence } from "@/lib/day.ts";
import { coreFill, slotColor, slotFill } from "@/lib/palette.ts";
import type { Action, Log, TrackingType } from "@/lib/progress.ts";
import { tally, todayState, type TodayState } from "@/lib/today.ts";

type Props = {
  planId: string;
  planTitle: string;
  subGoals: BoardSubGoal[];
  actions: BoardAction[];
  logs: Log[];
};

const TYPE = {
  habit: { label: "習慣", Icon: Repeat },
  quota: { label: "累計", Icon: Hash },
  milestone: { label: "里程碑", Icon: Flag },
  mantra: { label: "信念", Icon: Quote },
} satisfies Record<TrackingType, { label: string; Icon: typeof Repeat }>;

const CADENCE = { daily: "每日", weekly: "每週", monthly: "每月" } satisfies Record<Cadence, string>;
const PERIOD_UNIT = { daily: "天", weekly: "週", monthly: "個月" } satisfies Record<Cadence, string>;

// 統計區間在這頁用不到（今天只問「做了沒」，不問「這個月做得怎樣」），
// 但 buildBoard 是 81 格排版的唯一來源，還是走它，帶一個不影響顯示的預設值。
const UNUSED_RANGE = 30;

type ActionCell = Extract<Cell, { kind: "action" }>;

/** 顯示模型的格子轉成進度模型的行為。id 由呼叫端確認過才傳進來。 */
function actionOf(cell: ActionCell, id: string): Action {
  return { id, trackingType: cell.trackingType, cadence: cell.cadence, target: cell.target };
}

export function TodayMap({ planId, planTitle, subGoals, actions, logs }: Props) {
  const today = useToday();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // SSR 算不出當地日期，整張圖的亮暗會全錯。等瀏覽器補上再畫。
  if (!today) return <p className="text-sm text-dim">載入中…</p>;

  const board = buildBoard({ planTitle, subGoals, actions, logs, rangeDays: UNUSED_RANGE, today });
  const blocks = toBlocks(board.cells);
  const stateOf = (cell: Cell): TodayState | null =>
    cell.kind === "action" && cell.id ? todayState(actionOf(cell, cell.id), logs, today) : null;

  const counts = tally(board.cells.map(stateOf).filter((s): s is TodayState => s !== null));
  const selected = selectedKey === null ? null : board.cells.find((c) => keyOf(c) === selectedKey) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <Tally done={counts.done} total={counts.total} />

      <div className="mx-auto grid aspect-square w-full max-w-[560px] grid-cols-3 grid-rows-3 gap-2">
        {blocks.map((block, bi) => (
          <div key={bi} className="grid min-h-0 min-w-0 grid-cols-3 grid-rows-3 gap-1">
            {block.map((cell, ci) => (
              <MapCell
                key={ci}
                cell={cell}
                state={stateOf(cell)}
                selected={keyOf(cell) === selectedKey}
                onSelect={() => setSelectedKey(keyOf(cell) === selectedKey ? null : keyOf(cell))}
              />
            ))}
          </div>
        ))}
      </div>

      <Detail cell={selected} planId={planId} logs={logs} today={today} total={counts.total} />
    </div>
  );
}

function keyOf(cell: Cell) {
  if (cell.kind === "core") return "core";
  if (cell.kind === "subGoal") return `sg-${cell.slot}-${cell.mirrored}`;
  return `act-${cell.slot}-${cell.index}`;
}

/* ---------- 格子 ---------- */

function MapCell({
  cell, state, selected, onSelect,
}: { cell: Cell; state: TodayState | null; selected: boolean; onSelect: () => void }) {
  // 今天有事的格子才點得動。核心、次目標、空格與 idle 都只是背景。
  const live = state === "due" || state === "done" || state === "mantra";
  const ring = cell.kind === "core" ? "var(--accent)" : slotColor(cell.slot);

  return (
    <button
      type="button"
      disabled={!live}
      onClick={onSelect}
      aria-label={cell.title || "空格子"}
      aria-pressed={live ? selected : undefined}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-md border border-line/70 transition md:rounded-lg ${
        live ? "cursor-pointer hover:brightness-105" : "cursor-default"
      }`}
      style={{
        background: fillOf(cell, state),
        ...(selected ? { outline: `2px solid ${ring}`, outlineOffset: "1px" } : {}),
      }}
    >
      {state === "done" ? <Check size={14} strokeWidth={3} className="opacity-70" /> : null}
      {state === "mantra" ? <Quote size={11} className="opacity-40" /> : null}

      {/* 桌機的格子夠大才放字；手機上 37px 的格子塞不下，身分交給下面那條說明。 */}
      {state === "due" && cell.title ? (
        // text-black 不是隨便挑的：due 的底色是 oklch 亮度 0.68 的純色相，
        // 深色模式下繼承 --text 會變成白字壓在中亮底上，黃色那格幾乎看不見。
        <span className="hidden px-1 text-center text-[9px] leading-tight text-black line-clamp-2 md:block">
          {cell.title}
        </span>
      ) : null}
    </button>
  );
}

/**
 * 今天的地圖只有三種明暗：要做的亮、做完的半亮、其餘一律沉下去。
 * 沉下去的包含「今天沒它的事」與「還沒填」——今天早上不需要分辨這兩者。
 */
function fillOf(cell: Cell, state: TodayState | null): string {
  // 核心與次目標只是地標，濃度要明顯壓在 done（0.45）之下，
  // 不然那 9 格會被讀成「今天做完的」。
  if (cell.kind === "core") return coreFill(0.24);
  if (cell.kind === "subGoal") return slotFill(cell.slot, 0.16);
  switch (state) {
    case "due":
      return slotFill(cell.slot, 1);
    case "done":
      return slotFill(cell.slot, 0.45);
    case "mantra":
      return "var(--surface-2)";
    default:
      return slotFill(cell.slot, null);
  }
}

/* ---------- 計數 ---------- */

function Tally({ done, total }: { done: number; total: number }) {
  const all = total > 0 && done === total;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Sunrise size={15} className="text-accent-text" />
          今天
        </span>
        <span className="text-sm tabular-nums text-dim">
          {total === 0 ? "沒有待辦" : <><span className="font-semibold text-text">{done}</span> / {total}</>}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${total === 0 ? 0 : Math.round((done / total) * 100)}%` }}
        />
      </div>
      {all ? <p className="text-xs text-accent-text">今天的都做完了。</p> : null}
    </div>
  );
}

/* ---------- 下方那條說明 ---------- */

function Detail({
  cell, planId, logs, today, total,
}: { cell: Cell | null; planId: string; logs: Log[]; today: string; total: number }) {
  const box = "rounded-2xl border border-line bg-surface p-4";

  if (cell === null || cell.kind !== "action" || !cell.id) {
    return (
      <div className={`${box} text-sm text-dim`}>
        {total === 0
          ? "這份計劃表今天沒有要做的事。去格子頁填點東西，或者今天就休息。"
          : "有顏色的格子是今天要做的，點一下看它是什麼。"}
      </div>
    );
  }

  const state = todayState(actionOf(cell, cell.id), logs, today);
  const { Icon, label } = TYPE[cell.trackingType];
  const run = streak(logs, { id: cell.id, trackingType: cell.trackingType, cadence: cell.cadence }, today);
  const color = slotColor(cell.slot);

  return (
    <div className={`${box} flex flex-col gap-3`}>
      <div className="flex items-start gap-2.5">
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <p className={`min-w-0 flex-1 text-base font-medium leading-snug ${state === "mantra" ? "italic" : ""}`}>
          {cell.title}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-dim">
        <span className="flex items-center gap-1.5">
          <Icon size={13} />
          {label}
          {cell.trackingType === "habit" ? `・${CADENCE[cell.cadence ?? "daily"]}` : null}
          {cell.trackingType === "quota" && cell.target ? `・目標 ${cell.target}` : null}
        </span>
        {run > 0 ? (
          <span className="flex items-center gap-1 font-medium" style={{ color }}>
            <Flame size={13} />
            連續 {run} {PERIOD_UNIT[cell.cadence ?? "daily"]}
          </span>
        ) : null}
      </div>

      {state === "mantra" ? (
        <p className="text-xs text-dim">信念型不打卡、不計入今天的數字。看到它就好。</p>
      ) : (
        <LogButton cell={cell} planId={planId} today={today} state={state} color={color} />
      )}
    </div>
  );
}

function LogButton({
  cell, planId, today, state, color,
}: { cell: ActionCell; planId: string; today: string; state: TodayState; color: string }) {
  const quota = cell.trackingType === "quota";
  // 習慣與里程碑今天做過就不能再按（同期冪等會擋，按了也只是白跑一趟）；
  // 累計型永遠可以再加。
  const locked = state === "done" && !quota;

  return (
    <ActionForm action={logProgress} className="flex flex-col gap-1.5">
      {({ pending }) => {
        const done = locked || (pending && !quota);
        return (
          <>
            <input type="hidden" name="planId" value={planId} />
            <input type="hidden" name="actionId" value={cell.id} />
            <input type="hidden" name="day" value={today} />
            {quota ? <input type="hidden" name="value" value={1} /> : null}
            <button
              type="submit"
              disabled={done}
              className={`lift flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium text-black transition active:scale-[.99] ${
                done ? "cursor-default" : "cursor-pointer"
              }`}
              style={{ backgroundColor: color, opacity: done ? 0.55 : 1 }}
            >
              {quota ? <Plus size={16} strokeWidth={3} /> : <Check size={16} strokeWidth={3} />}
              {done ? "今天已完成" : quota ? "加一次" : "完成"}
            </button>
          </>
        );
      }}
    </ActionForm>
  );
}
