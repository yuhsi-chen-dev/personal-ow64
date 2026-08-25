import Link from "next/link";
import { PlanNav } from "../plan-nav.tsx";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth.ts";
import { loadPlan, loadPlanLogs } from "@/db/queries.ts";
import { ThemeToggle } from "@/app/theme-toggle.tsx";
import { ReviewCharts } from "./review-charts.tsx";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = (await auth())?.user?.id;
  if (!userId) redirect("/");

  const data = await loadPlan(userId, id);
  if (!data) notFound();

  // 熱圖要含封存格子的紀錄——收起一格不該讓那段日子從歷史上消失。
  // 底下的趨勢只算還在盤面上的行為，那問的是「現在這張表做得怎樣」。
  const allLogs = await loadPlanLogs(userId, id);

  return (
    <main className="w-full mx-auto max-w-5xl px-4 md:px-6 pb-16 flex flex-col gap-8">
      <header className="sticky top-0 z-20 -mx-4 md:-mx-6 flex items-center gap-2 md:gap-3 border-b border-line bg-bg/80 px-4 md:px-6 py-3 backdrop-blur-xl">
        <Link
          href="/dashboard"
          aria-label="回到計劃表列表"
          title="回到計劃表列表"
          className="lift tap grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-dim hover:text-text"
        >
          <ChevronLeft size={16} />
        </Link>
        {/*
          標題只放計劃表的名字。「今天・」「回顧・」那個前綴拿掉了——右邊亮著的那顆
          圖示已經在說你在哪一頁，而在 360px 的手機上前綴會吃掉標題一半的寬度，
          把真正要看的計劃表名字擠成「今天・2027...」。
        */}
        <h1 className="display min-w-0 flex-1 truncate text-base md:text-xl font-semibold">
          {data.plan.title}
        </h1>
        <PlanNav id={id} current="review" />
        <ThemeToggle />
      </header>

      <ReviewCharts
        subGoals={data.subGoals}
        actions={data.actions}
        logs={data.logs}
        allLogs={allLogs}
      />
    </main>
  );
}
