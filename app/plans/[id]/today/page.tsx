import Link from "next/link";
import { ChevronLeft, Grid3x3 } from "lucide-react";
import { notFound } from "next/navigation";
import { loadPlan } from "@/db/queries.ts";
import { ThemeToggle } from "@/app/theme-toggle.tsx";
import { TodayMap } from "./today-map.tsx";

export const dynamic = "force-dynamic";

export default async function TodayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadPlan(id);
  if (!data) notFound();

  return (
    <main className="w-full mx-auto max-w-3xl px-4 md:px-6 pb-16 flex flex-col gap-6">
      <header className="sticky top-0 z-20 -mx-4 md:-mx-6 flex items-center gap-3 border-b border-line bg-bg/80 px-4 md:px-6 py-3 backdrop-blur-xl">
        <Link
          href="/"
          aria-label="回到計劃表列表"
          className="lift grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-dim hover:text-text"
        >
          <ChevronLeft size={16} />
        </Link>
        <h1 className="display min-w-0 flex-1 truncate text-base md:text-xl font-semibold">
          今天・{data.plan.title}
        </h1>
        <Link
          href={`/plans/${id}`}
          aria-label="回到格子"
          title="回到格子"
          className="lift grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-dim hover:text-text"
        >
          <Grid3x3 size={16} />
        </Link>
        <ThemeToggle />
      </header>

      <TodayMap
        planId={id}
        planTitle={data.plan.title}
        subGoals={data.subGoals}
        actions={data.actions}
        logs={data.logs}
      />
    </main>
  );
}
