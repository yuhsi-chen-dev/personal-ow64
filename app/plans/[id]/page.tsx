import Link from "next/link";
import { ChevronLeft, LineChart, Sunrise } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth.ts";
import { loadPlan } from "@/db/queries.ts";
import { ThemeToggle } from "@/app/theme-toggle.tsx";
import { RANGE_CHOICES, rangeDaysInput } from "@/lib/schemas.ts";
import { PlanBoard } from "./plan-board.tsx";

// 這頁每次請求都要讀當下的資料，不能在 build 時預渲染
// （會連不到資料庫，而且預渲染出來的進度是舊的）。
export const dynamic = "force-dynamic";

const RANGE_LABEL: Record<number, string> = { 30: "30 天", 90: "90 天", 365: "一年" };

export default async function PlanPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { id } = await params;
  // 沒登入就沒有「自己的表」可看，導回首頁的登入畫面。
  const userId = (await auth())?.user?.id;
  if (!userId) redirect("/");
  // 網址是跨信任邊界的輸入，認不得的值退回 30，不要丟 500。見 lib/schemas.ts。
  const rangeDays = rangeDaysInput.parse((await searchParams).days);
  // 別人的 id 在這裡回 null，跟不存在同一個結果——不要讓人分辨得出來。
  const data = await loadPlan(userId, id);
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
        <Link
          href={`/plans/${id}/today`}
          className="lift grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-dim hover:text-text"
          aria-label="今天"
          title="今天"
        >
          <Sunrise size={16} />
        </Link>
        <Link
          href={`/plans/${id}/review`}
          className="lift grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-dim hover:text-text"
          aria-label="回顧"
          title="回顧"
        >
          <LineChart size={16} />
        </Link>
        <ThemeToggle />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-dim">統計區間</span>
        {RANGE_CHOICES.map((d) => (
          <Link
            key={d}
            href={`?days=${d}`}
            scroll={false}
            aria-current={d === rangeDays ? "true" : undefined}
            className={`lift rounded-full border px-3 py-1 text-xs ${
              d === rangeDays
                ? "border-transparent bg-accent font-medium text-black"
                : "border-line bg-surface text-dim hover:text-text"
            }`}
          >
            {RANGE_LABEL[d] ?? `${d} 天`}
          </Link>
        ))}
        {/* 分母會跟著區間變，這件事得講出來，不然使用者會以為進度自己掉了。 */}
        <span className="text-xs text-dim/70">習慣型的分母跟著這裡變</span>
      </div>

      <PlanBoard
        planId={id}
        planTitle={data.plan.title}
        subGoals={data.subGoals}
        actions={data.actions}
        logs={data.logs}
        rangeDays={rangeDays}
      />
    </main>
  );
}
