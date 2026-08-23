import Link from "next/link";
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
      <header className="sticky top-0 z-20 -mx-4 md:-mx-6 flex items-center gap-3 border-b border-line bg-bg/80 px-4 md:px-6 py-3 backdrop-blur-xl">
        <Link
          href={`/plans/${id}`}
          aria-label="回到格子"
          className="lift grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-dim hover:text-text"
        >
          <ChevronLeft size={16} />
        </Link>
        <h1 className="display min-w-0 flex-1 truncate text-base md:text-xl font-semibold">
          回顧・{data.plan.title}
        </h1>
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
