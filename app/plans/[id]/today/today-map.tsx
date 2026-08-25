"use client";

import { useState } from "react";
import { Check, Flag, Flame, Hash, Plus, Quote, Repeat, Sunrise, Undo2 } from "lucide-react";
import { ActionForm } from "@/app/action-form.tsx";
import { logProgress, undoProgress } from "@/app/actions.ts";
import { useToday } from "@/app/use-today.ts";
import { buildBoard, cellAction, streak, toBlocks, type BoardAction, type BoardSubGoal, type Cell } from "@/lib/board.ts";
import type { Cadence } from "@/lib/day.ts";
import { coreFill, slotColor, slotFill } from "@/lib/palette.ts";
import type { Log, TrackingType } from "@/lib/progress.ts";
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
/** 「今天已完成」那類說法要用這一期，不是頻率本身。 */
const THIS_PERIOD = { daily: "今天", weekly: "本週", monthly: "本月" } satisfies Record<Cadence, string>;
const PERIOD_UNIT = { daily: "天", weekly: "週", monthly: "個月" } satisfies Record<Cadence, string>;

// 統計區間在這頁用不到（今天只問「做了沒」，不問「這個月做得怎樣」），
// 但 buildBoard 是 81 格排版的唯一來源，還是走它，帶一個不影響顯示的預設值。
const UNUSED_RANGE = 30;

type ActionCell = Extract<Cell, { kind: "action" }>;

export function TodayMap({ planId, planTitle, subGoals, actions, logs }: Props) {
  const today = useToday();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // SSR 算不出當地日期，整張圖的亮暗會全錯。等瀏覽器補上再畫。
  if (!today) return <p className="text-sm text-dim">載入中…</p>;

  const board = buildBoard({ planTitle, subGoals, actions, logs, rangeDays: UNUSED_RANGE, today });
  const blocks = toBlocks(board.cells);
  const stateOf = (cell: Cell): TodayState | null =>
    cell.kind === "action" && cell.id ? todayState(cellAction(cell, cell.id), logs, today) : null;

  const counts = tally(board.cells.map(stateOf).filter((s): s is TodayState => s !== null));
  const selected = selectedKey === null ? null : board.cells.find((c) => keyOf(c) === selectedKey) ?? null;

  return (
    // 手機上底下那張卡是固定在螢幕底部的，盤面得自己讓出那塊空間，
    // 否則最後一列格子點不到。ponytail: 定值，多的只是捲動餘裕。
    <div className="flex flex-col gap-5 pb-56 md:pb-0">
      <Tally done={counts.done} total={counts.total} />

      {/*
        盤面是正方形，寬度吃滿高度就跟著吃滿，小螢幕上會頂到底下那張固定的卡片。
        手機：扣掉標題列、計數列與卡片大約 260px，剩下的才是盤面能用的邊長——
        這一頁的重點是「今天一眼看完」，被蓋掉兩列就得捲，那就白做了。
        md 以上卡片回到一般流，不用讓位，扣掉的只有標題列與計數列。
      */}
      <div className="mx-auto grid aspect-square w-full max-w-[min(100%,560px,calc(100dvh-260px))] grid-cols-3 grid-rows-3 gap-2 md:max-w-[min(100%,560px,calc(100dvh-130px))]">
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
  // open（里程碑／累計）也點得動——它不計分，但仍然可以推進。
  const live = state === "due" || state === "done" || state === "open" || state === "mantra";
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
 * 今天的地圖分四階：今天該做的最亮、做完的半亮、**隨時可以推進的（open）介於中間偏暗**、
 * 其餘一律沉下去。沉下去的包含「今天沒它的事」與「還沒填」——今天早上不需要分辨這兩者。
 *
 * open 要看得出「有東西、可以按」，但濃度必須明顯低於 due，
 * 不然一年期的里程碑會跟今天真的該做的事搶同一個視覺順位。
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
    case "open":
      return slotFill(cell.slot, 0.3);
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
  // 這一頁是為手機存在的，而打卡那顆按鈕原本排在 390px 高的盤面底下——
  // 每天早上都要先捲一次才按得到。改成固定在螢幕底部的拇指區，盤面留在上面看得見。
  // 高度用 dvh 不用 vh：iOS Safari 的 vh 不含工具列，會讓卡片比看得見的區域還高。
  const box =
    "fixed inset-x-0 bottom-0 z-30 max-h-[70dvh] overflow-y-auto border-t border-line bg-surface p-5 shadow-[var(--shadow)] " +
    "md:static md:z-auto md:max-h-none md:overflow-visible md:rounded-2xl md:border md:p-4 md:shadow-none";

  if (cell === null || cell.kind !== "action" || !cell.id) {
    return (
      <div className={`${box} text-sm text-dim`}>
        {total === 0
          ? "這份計劃表今天沒有要做的事。去格子頁填點東西，或者今天就休息。"
          : "亮的格子是今天要做的，淡的是隨時可以推進的目標。點一下看它是什麼。"}
      </div>
    );
  }

  const state = todayState(cellAction(cell, cell.id), logs, today);
  const { Icon, label } = TYPE[cell.trackingType];
  const run = streak(logs, cellAction(cell, cell.id), today);
  const color = slotColor(cell.slot);
  // 撤銷只收回今天的最後一筆，所以數的是當天筆數。
  const todayCount = logs.filter((l) => l.actionId === cell.id && l.day === today).length;

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
          {cell.trackingType === "habit"
            ? `・${CADENCE[cell.cadence ?? "daily"]}${cell.periodNeed > 1 ? ` ${cell.periodNeed} 次` : ""}`
            : null}
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
        <>
          <LogButton cell={cell} planId={planId} today={today} state={state} color={color} />
          {todayCount > 0 ? (
            <UndoRow actionId={cell.id} planId={planId} today={today} count={todayCount} />
          ) : null}
          {state === "open" ? (
            // 不講的話，使用者會按下去然後發現上面的數字沒動，以為壞了。
            <p className="text-xs text-dim">這種目標沒有週期，隨時可以推進，不算進今天的數字。</p>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * 誤觸的後悔鍵：撤銷今天的最後一筆。跟格子頁面板上的那一顆同一支 server action。
 * 只在今天真的有紀錄時才出現，不然它就是一顆按了會出錯的死鍵。
 */
function UndoRow({
  actionId, planId, today, count,
}: { actionId: string; planId: string; today: string; count: number }) {
  return (
    <ActionForm action={undoProgress} className="flex items-center justify-center gap-2">
      {({ pending }) => (
        <>
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="actionId" value={actionId} />
          <input type="hidden" name="day" value={today} />
          <span className="text-xs text-dim">今天記了 {count} 次</span>
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-dim cursor-pointer transition hover:text-text disabled:cursor-default disabled:opacity-50"
          >
            <Undo2 size={12} />
            {pending ? "撤銷中…" : "撤銷上一次"}
          </button>
        </>
      )}
    </ActionForm>
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
        // 樂觀回饋：按下去立刻加一次。一期要三次的走到 1/3 就停，不會直接變成已完成。
        const optimistic = cell.periodDone + (pending && !quota ? 1 : 0);
        const done = locked || (pending && !quota && optimistic >= cell.periodNeed);
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
              {done
                ? `${THIS_PERIOD[cell.cadence ?? "daily"]}已完成`
                : quota
                  ? "加一次"
                  : cell.periodNeed > 1
                    ? `${THIS_PERIOD[cell.cadence ?? "daily"]} ${optimistic}/${cell.periodNeed}`
                    : "完成"}
            </button>
          </>
        );
      }}
    </ActionForm>
  );
}
