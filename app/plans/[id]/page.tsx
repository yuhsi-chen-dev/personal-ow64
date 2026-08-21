import { notFound } from "next/navigation";
import { loadPlan } from "@/db/queries.ts";
import { layout, SIZE, type Cell } from "@/lib/mandala.ts";
import { rollup, type Action, type Log } from "@/lib/progress.ts";
import { logProgress, saveAction, saveSubGoal } from "@/app/actions.ts";
import { ActionForm } from "@/app/action-form.tsx";

// ponytail: 統計區間先固定 30 天。要讓使用者自選時再拉成參數。
const RANGE_DAYS = 30;
const today = () => new Date().toISOString().slice(0, 10);

// 這頁每次請求都要讀當下的資料，不能在 build 時預渲染
// （會連不到資料庫，而且預渲染出來的進度是舊的）。
export const dynamic = "force-dynamic";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadPlan(id);
  if (!data) notFound();

  const subGoalAt = (pos: number) => data.subGoals.find((s) => s.position === pos);
  const actionAt = (sgPos: number, pos: number) => {
    const sg = subGoalAt(sgPos);
    return sg ? data.actions.find((a) => a.subGoalId === sg.id && a.position === pos) : undefined;
  };
  const progressOf = (sgPos: number) => {
    const sg = subGoalAt(sgPos);
    if (!sg) return null;
    const mine = data.actions.filter((a) => a.subGoalId === sg.id) as Action[];
    return rollup(mine, data.logs as Log[], RANGE_DAYS);
  };

  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

  function renderCell(cell: Cell) {
    if (cell.kind === "core") {
      return (
        <div className="bg-amber-100 p-1 flex flex-col justify-center">
          <span className="text-[9px] text-neutral-500">核心目標</span>
          <span className="text-xs font-semibold leading-tight">{data!.plan.title}</span>
        </div>
      );
    }

    if (cell.kind === "subGoal") {
      const sg = subGoalAt(cell.subGoal);
      // 鏡像格只顯示，編輯一律回到中央區塊那一格，避免兩處都能改。
      if (cell.mirrored) {
        return (
          <div className="bg-sky-50 p-1 flex flex-col justify-between">
            <span className="text-xs leading-tight">{sg?.title ?? "—"}</span>
            <span className="text-[10px] text-sky-700">{pct(progressOf(cell.subGoal))}</span>
          </div>
        );
      }
      return (
        <ActionForm action={saveSubGoal} className="bg-sky-100 p-1 flex flex-col gap-0.5">
          <input type="hidden" name="planId" value={id} />
          <input type="hidden" name="position" value={cell.subGoal} />
          <span className="text-[9px] text-neutral-500">次目標 {cell.subGoal + 1}</span>
          <input
            name="title"
            defaultValue={sg?.title ?? ""}
            placeholder="填寫…"
            className="w-full text-xs bg-white/70 rounded px-1 py-0.5"
          />
          <button type="submit" className="text-[10px] text-sky-800 self-start underline">
            存
          </button>
        </ActionForm>
      );
    }

    const sg = subGoalAt(cell.subGoal);
    if (!sg) {
      return <div className="bg-neutral-50 grid place-items-center text-[10px] text-neutral-400">先填次目標</div>;
    }

    const act = actionAt(cell.subGoal, cell.action);
    return (
      <div className="bg-white p-1 flex flex-col gap-0.5">
        <ActionForm action={saveAction} className="flex flex-col gap-0.5">
          <input type="hidden" name="planId" value={id} />
          <input type="hidden" name="subGoalId" value={sg.id} />
          <input type="hidden" name="position" value={cell.action} />
          <input
            name="title"
            defaultValue={act?.title ?? ""}
            placeholder="具體行為…"
            className="w-full text-[11px] border rounded px-1 py-0.5"
          />
          <div className="flex gap-0.5">
            <select
              name="trackingType"
              defaultValue={act?.trackingType ?? "daily"}
              className="text-[10px] border rounded flex-1 min-w-0"
            >
              <option value="daily">每日</option>
              <option value="count">次數</option>
              <option value="percent">%</option>
            </select>
            <input
              name="target"
              type="number"
              min="1"
              defaultValue={act?.target ?? ""}
              placeholder="目標"
              className="text-[10px] border rounded w-10 px-0.5"
            />
          </div>
          <button type="submit" className="text-[10px] text-neutral-700 self-start underline">
            存
          </button>
        </ActionForm>

        {act ? (
          <ActionForm action={logProgress} className="flex gap-0.5 items-center border-t pt-0.5">
            <input type="hidden" name="planId" value={id} />
            <input type="hidden" name="actionId" value={act.id} />
            <input type="hidden" name="day" value={today()} />
            {act.trackingType === "daily" ? null : (
              <input
                name="value"
                type="number"
                step="any"
                placeholder={act.trackingType === "percent" ? "0-100" : "數量"}
                className="text-[10px] border rounded w-12 px-0.5"
              />
            )}
            <button type="submit" className="text-[10px] text-green-700 underline">
              打卡
            </button>
          </ActionForm>
        ) : null}
      </div>
    );
  }

  return (
    <main className="p-6 flex flex-col items-center gap-4">
      <h1 className="text-xl font-semibold">{data.plan.title}</h1>
      <p className="text-xs text-neutral-500">進度以最近 {RANGE_DAYS} 天為統計區間。</p>
      <div
        className="grid gap-px bg-neutral-300 border border-neutral-300"
        style={{ gridTemplateColumns: `repeat(${SIZE}, 7.5rem)` }}
      >
        {layout().map((cell, i) => (
          <div key={i} className="h-28 overflow-hidden">
            {renderCell(cell)}
          </div>
        ))}
      </div>
    </main>
  );
}
