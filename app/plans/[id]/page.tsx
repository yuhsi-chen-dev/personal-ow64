import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { loadPlan } from "@/db/queries.ts";
import { ThemeToggle } from "@/app/theme-toggle.tsx";
import { PlanBoard } from "./plan-board.tsx";

// 這頁每次請求都要讀當下的資料，不能在 build 時預渲染
// （會連不到資料庫，而且預渲染出來的進度是舊的）。
export const dynamic = "force-dynamic";

// ponytail: 統計區間先固定 30 天。要讓使用者自選時再拉成參數。
const RANGE_DAYS = 30;

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadPlan(id);
  if (!data) notFound();

  return (
    // body 是 flex column，這裡的 w-full 不能拿掉，否則 main 會縮成內容寬度。
    <main className="w-full mx-auto max-w-6xl px-4 md:px-6 pb-44 md:pb-10 flex flex-col gap-6">
      <header className="sticky top-0 z-20 -mx-4 md:-mx-6 flex items-center gap-3 border-b border-line bg-bg/80 px-4 md:px-6 py-3 backdrop-blur-xl">
        <Link
          href="/"
          aria-label="回到計劃表列表"
          className="lift grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-dim hover:text-text"
        >
          <ChevronLeft size={16} />
        </Link>
        <h1 className="display min-w-0 flex-1 truncate text-base md:text-xl font-semibold">{data.plan.title}</h1>
        <ThemeToggle />
      </header>

      <PlanBoard
        planId={id}
        planTitle={data.plan.title}
        subGoals={data.subGoals}
        actions={data.actions}
        logs={data.logs}
        rangeDays={RANGE_DAYS}
      />
    </main>
  );
}
