"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Flag, Flame, Grid3x3, Hash, Plus, Quote, Repeat, X } from "lucide-react";
import { ActionForm } from "@/app/action-form.tsx";
import { logProgress, saveAction, saveSubGoal } from "@/app/actions.ts";
import {
  blockOfCell, buildBoard, heat, recentPeriods, streak, toBlocks,
  type BoardAction, type BoardSubGoal, type Cell,
} from "@/lib/board.ts";
import { localDay, type Cadence } from "@/lib/day.ts";
import { coreFill, slotColor, slotFill } from "@/lib/palette.ts";
import type { Log, TrackingType } from "@/lib/progress.ts";

type Props = {
  planId: string;
  planTitle: string;
  subGoals: BoardSubGoal[];
  actions: BoardAction[];
  logs: Log[];
  rangeDays: number;
};

/** 只有瀏覽器算得準當地日期；SSR 時給空字串，避免 hydration mismatch。 */
function useToday() {
  return useSyncExternalStore(() => () => {}, () => localDay(), () => "");
}

const pct = (p: number | null) => (p === null ? "—" : `${Math.round(p * 100)}%`);

const TYPE = {
  habit: { label: "習慣", hint: "固定頻率重複做的事", Icon: Repeat },
  quota: { label: "累計", hint: "朝一個總量前進", Icon: Hash },
  milestone: { label: "里程碑", hint: "做完一次就結束", Icon: Flag },
  mantra: { label: "信念", hint: "銘記在心，不追蹤進度", Icon: Quote },
} satisfies Record<TrackingType, { label: string; hint: string; Icon: typeof Repeat }>;

const CADENCE = { daily: "每日", weekly: "每週", monthly: "每月" } satisfies Record<Cadence, string>;
/** 已完成的說法要用「這一期」而不是頻率本身：「每日已完成」讀起來不像話。 */
const THIS_PERIOD = { daily: "今天", weekly: "本週", monthly: "本月" } satisfies Record<Cadence, string>;
const PERIOD_UNIT = { daily: "天", weekly: "週", monthly: "個月" } satisfies Record<Cadence, string>;

export function PlanBoard({ planId, planTitle, subGoals, actions, logs, rangeDays }: Props) {
  const today = useToday();
  // 兩段式互動：先點區塊讓它長大，再點裡面的格子才開面板。
  // 一步到位的話，手機上剛長大的區塊會立刻被底部面板蓋住。
  const [focus, setFocus] = useState<number | null>(null);
  const [selected, setSelected] = useState<Cell | null>(null);
  const board = buildBoard({ planTitle, subGoals, actions, logs, rangeDays, today });
  const blocks = toBlocks(board.cells);

  function pick(cell: Cell) {
    const block = blockOfCell(cell);
    if (block !== focus) {
      setFocus(block);
      setSelected(null);
    } else {
      setSelected(cell);
    }
  }

  // 聚焦的那一行／那一列拿到多數空間，其餘縮成小地圖。fr 之間可以平滑補間。
  const track = (i: number, at: number | null) => (at === null ? "1fr" : i === at ? "2.2fr" : "1fr");
  const focusRow = focus === null ? null : Math.floor(focus / 3);
  const focusCol = focus === null ? null : focus % 3;

  return (
    <div className="flex flex-col md:flex-row md:items-start gap-6">
      <section className="flex-1 min-w-0">
        <div
          // 外層必須是固定的正方形，否則 fr 在自動高度的容器裡不會照比例分配，
          // 聚焦的那一欄會把整張表撐得又高又歪。
          className="mx-auto grid aspect-square w-full max-w-[760px] gap-2"
          style={{
            gridTemplateColumns: [0, 1, 2].map((i) => track(i, focusCol)).join(" "),
            gridTemplateRows: [0, 1, 2].map((i) => track(i, focusRow)).join(" "),
            transition: "grid-template-columns 340ms cubic-bezier(.2,.8,.2,1), grid-template-rows 340ms cubic-bezier(.2,.8,.2,1)",
          }}
        >
          {blocks.map((block, bi) => {
            const on = focus === bi;
            return (
              <div
                key={bi}
                className="grid min-h-0 min-w-0 grid-cols-3 grid-rows-3 gap-1 transition-opacity duration-300"
                style={{ opacity: focus === null || on ? 1 : 0.55 }}
              >
                {block.map((cell, ci) => (
                  <BoardCell
                    key={ci}
                    cell={cell}
                    planId={planId}
                    today={today}
                    // 沒聚焦時每格都放小字；一旦聚焦，只有放大的那塊有字，
                    // 其餘退成純色小地圖——6px 的字誰也讀不了，留著只是雜訊。
                    detail={focus === null ? "small" : on ? "large" : "none"}
                    selected={isSame(cell, selected)}
                    onSelect={() => pick(cell)}
                  />
                ))}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-col items-center gap-2">
          {focus === null ? (
            <p className="text-center text-xs text-dim">
              顏色深淺是最近 {rangeDays} 天的達成率，每個次目標有自己的顏色。點任一區塊放大。
            </p>
          ) : (
            <button
              type="button"
              onClick={() => { setFocus(null); setSelected(null); }}
              className="lift inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-dim hover:text-text cursor-pointer"
            >
              <Grid3x3 size={13} />
              回到全覽
            </button>
          )}
        </div>
      </section>

      <Panel cell={selected} planId={planId} logs={logs} today={today} onClose={() => setSelected(null)} />
    </div>
  );
}

function isSame(a: Cell, b: Cell | null) {
  if (!b || a.kind !== b.kind) return false;
  if (a.kind === "core") return true;
  if (a.kind === "subGoal" && b.kind === "subGoal") return a.slot === b.slot && a.mirrored === b.mirrored;
  if (a.kind === "action" && b.kind === "action") return a.slot === b.slot && a.index === b.index;
  return false;
}

function cellKey(cell: Cell) {
  if (cell.kind === "core") return "core";
  if (cell.kind === "subGoal") return `sg-${cell.slot}-${cell.mirrored}`;
  return `act-${cell.slot}-${cell.index}`;
}

function BoardCell({
  cell, planId, today, detail, selected, onSelect,
}: {
  cell: Cell;
  planId: string;
  today: string;
  detail: "none" | "small" | "large";
  selected: boolean;
  onSelect: () => void;
}) {
  // 信念型不參與熱力圖：它沒有進度，上色會被誤讀成「還沒做」。
  const isMantra = cell.kind === "action" && cell.trackingType === "mantra" && cell.id;
  const intensity = heat(cell.progress);
  const background = isMantra
    ? "var(--surface-2)"
    : cell.kind === "core"
      ? coreFill(intensity)
      : slotFill(cell.slot, intensity);
  const ring = cell.kind === "core" ? "var(--accent)" : slotColor(cell.slot);
  const big = detail === "large";

  return (
    <div
      className={`lift relative h-full w-full overflow-hidden border border-line/70 ${
        big ? "rounded-xl md:rounded-2xl" : detail === "none" ? "rounded-sm md:rounded-md" : "rounded-md md:rounded-lg"
      }`}
      style={{
        background,
        ...(selected ? { outline: `2px solid ${ring}`, outlineOffset: "1px" } : {}),
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={cell.title || "空格子"}
        className={`absolute inset-x-0 top-0 cursor-pointer ${
          big && cell.kind === "action" && cell.id && cell.trackingType !== "mantra" ? "bottom-7" : "bottom-0"
        }`}
      />

      {detail === "none" ? null : (
      <div className={`pointer-events-none absolute inset-0 flex flex-col justify-between ${big ? "p-2 md:p-2.5" : "p-1"}`}>
          <span className="flex items-start gap-1">
            {isMantra ? <Quote size={big ? 14 : 10} className="mt-px shrink-0 opacity-50" /> : null}
            <span
              className={`min-w-0 leading-snug ${big ? "line-clamp-4" : "line-clamp-2"} ${
                big
                  ? cell.kind === "core" ? "text-sm md:text-base font-semibold" : "text-xs md:text-sm"
                  : cell.kind === "core" ? "text-[9px] md:text-[11px] font-semibold" : "text-[8px] md:text-[10px]"
              } ${isMantra ? "italic opacity-80" : ""}`}
            >
              {cell.title}
            </span>
          </span>

          {cell.kind !== "action" && cell.progress !== null ? (
            <span className={`self-end font-medium tabular-nums opacity-70 ${big ? "text-xs md:text-sm" : "text-[8px] md:text-[10px]"}`}>
              {pct(cell.progress)}
            </span>
          ) : null}

          {big && cell.kind === "action" && cell.id && cell.trackingType !== "mantra" && cell.progress !== null ? (
            <span className="mb-7 h-1 rounded-full bg-black/10">
              <span
                className="block h-full rounded-full transition-[width] duration-500"
                style={{ width: `${Math.round(cell.progress * 100)}%`, backgroundColor: slotColor(cell.slot) }}
              />
            </span>
          ) : null}
      </div>
      )}

      {big && cell.kind === "action" && cell.id && cell.trackingType !== "mantra" ? (
        <CheckStrip cell={cell} planId={planId} today={today} />
      ) : null}
    </div>
  );
}

/**
 * 打卡的主要入口：聚焦後每格底部一整條，有圖示也有字。
 * 原本是右下角一顆 16px 的圓圈——太小、沒有標籤，而且分不出「可以按」與「已完成」。
 * 打卡是每天做好幾次的事，該拿到最大的目標；編輯偶爾才做一次，讓給格子本體。
 */
function CheckStrip({
  cell, planId, today,
}: { cell: Extract<Cell, { kind: "action" }>; planId: string; today: string }) {
  const quota = cell.trackingType === "quota";
  return (
    <ActionForm action={logProgress} compact className="absolute inset-x-0 bottom-0 z-10">
      {({ pending }) => {
        // 樂觀回饋：按下去立刻變成完成的樣子，不等伺服器回來。
        const done = cell.doneNow || (pending && !quota);
        return (
          <>
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="actionId" value={cell.id} />
          <input type="hidden" name="day" value={today} />
          {quota ? <input type="hidden" name="value" value={1} /> : null}
          <button
            type="submit"
            disabled={!today || (cell.doneNow && !quota)}
            className={`flex w-full items-center justify-center gap-1.5 border-t py-1.5 text-xs font-medium transition active:scale-[.98] ${
              done ? "border-transparent text-black" : "border-line/60 text-dim hover:text-text cursor-pointer"
            }`}
            style={done ? { backgroundColor: slotColor(cell.slot) } : undefined}
          >
            {quota ? <Plus size={13} strokeWidth={3} /> : <Check size={13} strokeWidth={3} />}
            {quickLabel({ ...cell, doneNow: done })}
          </button>
          </>
        );
      }}
    </ActionForm>
  );
}

function quickLabel(cell: Extract<Cell, { kind: "action" }>) {
  if (cell.trackingType === "quota") return "＋1";
  if (cell.trackingType === "milestone") return cell.doneNow ? "已完成" : "標記完成";
  return cell.doneNow ? `${THIS_PERIOD[cell.cadence ?? "daily"]}已完成` : "記一次";
}

function Panel({
  cell, planId, logs, today, onClose,
}: { cell: Cell | null; planId: string; logs: Log[]; today: string; onClose: () => void }) {
  return (
    <aside
      className="fixed inset-x-0 bottom-0 z-30 max-h-[72vh] overflow-y-auto border-t border-line bg-surface p-5
                 md:static md:top-4 md:sticky md:max-h-none md:w-80 md:shrink-0 md:rounded-2xl md:border
                 shadow-[var(--shadow)]"
    >
      {cell === null ? (
        <p className="text-sm text-dim">點左邊任何一格開始編輯。</p>
      ) : (
        <>
          <div className="mb-4 flex items-start justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: cell.kind === "core" ? "var(--accent)" : slotColor(cell.slot) }}
              />
              {panelTitle(cell)}
            </span>
            <button type="button" onClick={onClose} aria-label="關閉面板" className="text-dim hover:text-text cursor-pointer">
              <X size={16} />
            </button>
          </div>
          <PanelBody key={cellKey(cell)} cell={cell} planId={planId} logs={logs} today={today} />
        </>
      )}
    </aside>
  );
}

function panelTitle(cell: Cell) {
  if (cell.kind === "core") return "核心目標";
  if (cell.kind === "subGoal") return `次目標 ${cell.slot + 1}`;
  return `次目標 ${cell.slot + 1} ・ 行為 ${cell.index + 1}`;
}

const inputCls = "w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent";
const labelCls = "text-xs text-dim";
const submitCls = "lift mt-1 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-black cursor-pointer";

function PanelBody({ cell, planId, logs, today }: { cell: Cell; planId: string; logs: Log[]; today: string }) {
  // 追蹤方式決定要顯示哪些欄位，所以得留在元件狀態裡；
  // 全部欄位一直攤在那邊，填的人會不知道哪個對自己有效。
  const [type, setType] = useState<TrackingType>(cell.kind === "action" ? cell.trackingType : "habit");

  if (cell.kind === "core") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-base font-semibold leading-snug">{cell.title}</p>
        <Meter value={cell.progress} color="var(--accent)" />
        <p className="text-xs text-dim">整體進度由底下的行為往上彙總，信念型不列入計算。</p>
        <p className="text-xs text-dim/70">（改核心目標的名稱還沒做。）</p>
      </div>
    );
  }

  if (cell.kind === "subGoal") {
    return (
      <ActionForm action={saveSubGoal} className="flex flex-col gap-2">
        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="position" value={cell.slot} />
        <label className={labelCls}>名稱</label>
        <input name="title" defaultValue={cell.title} placeholder="例如：閱讀" className={inputCls} />
        <Meter value={cell.progress} color={slotColor(cell.slot)} />
        <p className="text-xs text-dim">底下行為的平均</p>
        <button type="submit" className={submitCls}>儲存</button>
      </ActionForm>
    );
  }

  if (!cell.subGoalId) {
    return <p className="text-sm text-dim">要先填好次目標 {cell.slot + 1}，才能在底下寫具體行為。</p>;
  }

  const id = cell.id;
  const track = { trackingType: cell.trackingType, cadence: cell.cadence };
  const periods = id ? recentPeriods(logs, { id, ...track }, today) : [];
  const run = id ? streak(logs, { id, ...track }, today) : 0;

  return (
    <div className="flex flex-col gap-5">
      <ActionForm action={saveAction} className="flex flex-col gap-2">
        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="subGoalId" value={cell.subGoalId} />
        <input type="hidden" name="position" value={cell.index} />
        <input type="hidden" name="trackingType" value={type} />

        <label className={labelCls}>具體行為</label>
        <input name="title" defaultValue={cell.title} placeholder="例如：每天讀 20 分鐘" className={inputCls} />

        <label className={labelCls}>這是哪一種</label>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(TYPE) as TrackingType[]).map((t) => {
            const { label, Icon } = TYPE[t];
            const on = type === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                aria-pressed={on}
                className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs cursor-pointer transition ${
                  on ? "border-transparent text-black" : "border-line text-dim hover:text-text"
                }`}
                style={on ? { backgroundColor: slotColor(cell.slot) } : undefined}
              >
                <Icon size={13} />
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-dim/80">{TYPE[type].hint}</p>

        {type === "habit" ? (
          <>
            <label className={labelCls}>頻率</label>
            <select name="cadence" defaultValue={cell.cadence ?? "daily"} className={inputCls}>
              {(Object.keys(CADENCE) as Cadence[]).map((c) => (
                <option key={c} value={c}>{CADENCE[c]}一次</option>
              ))}
            </select>
          </>
        ) : null}

        {type === "quota" ? (
          <>
            <label className={labelCls}>目標數量</label>
            <input name="target" type="number" min="1" defaultValue={cell.target ?? ""} placeholder="例如 10" className={inputCls} />
          </>
        ) : null}

        <button type="submit" className={submitCls}>儲存</button>
      </ActionForm>

      {cell.id ? (
        cell.trackingType === "mantra" ? (
          <p className="flex items-start gap-2 border-t border-line pt-4 text-xs text-dim">
            <Quote size={13} className="mt-0.5 shrink-0" />
            信念型不追蹤、不計入進度，也不會被算成「還沒做」。
          </p>
        ) : (
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-dim">
                {(() => {
                  const Icon = TYPE[cell.trackingType].Icon;
                  return <Icon size={13} />;
                })()}
                {TYPE[cell.trackingType].label}
                {cell.trackingType === "habit" ? `・${CADENCE[cell.cadence ?? "daily"]}` : null}
                {cell.trackingType === "quota" && cell.target ? `・目標 ${cell.target}` : null}
              </span>
              {run > 0 ? (
                <span className="flex items-center gap-1 text-xs font-medium" style={{ color: slotColor(cell.slot) }}>
                  <Flame size={13} />
                  連續 {run} {PERIOD_UNIT[cell.cadence ?? "daily"]}
                </span>
              ) : null}
            </div>

            <Meter value={cell.progress} color={slotColor(cell.slot)} />

            {periods.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <span className={labelCls}>最近 {periods.length} {PERIOD_UNIT[cell.cadence ?? "daily"]}</span>
                <div className="flex gap-1">
                  {periods.map(({ key, done }) => (
                    <span
                      key={key}
                      title={key}
                      className="h-6 flex-1 rounded-md transition"
                      style={{ backgroundColor: done ? slotColor(cell.slot) : "var(--surface-2)" }}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <RecordForm cell={cell} planId={planId} today={today} />
          </div>
        )
      ) : (
        <p className="text-xs text-dim">儲存之後才能開始記錄。</p>
      )}
    </div>
  );
}

function Meter({ value, color }: { value: number | null; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.round((value ?? 0) * 100)}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs tabular-nums text-dim">{pct(value)}</span>
    </div>
  );
}

function RecordForm({
  cell, planId, today,
}: { cell: Extract<Cell, { kind: "action" }>; planId: string; today: string }) {
  const quota = cell.trackingType === "quota";
  return (
    <ActionForm action={logProgress} className="flex items-center gap-2">
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="actionId" value={cell.id} />
      <input type="hidden" name="day" value={today} />
      {quota ? <input name="value" type="number" step="any" min="1" placeholder="數量" className={`${inputCls} w-24`} /> : null}
      <button
        type="submit"
        disabled={!today}
        className="lift flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium cursor-pointer disabled:opacity-50"
        style={{ borderColor: slotColor(cell.slot), color: slotColor(cell.slot) }}
      >
        {quota ? <Plus size={14} strokeWidth={2.5} /> : <Check size={14} strokeWidth={2.5} />}
        {quota ? "記錄" : quickLabel(cell)}
      </button>
    </ActionForm>
  );
}
