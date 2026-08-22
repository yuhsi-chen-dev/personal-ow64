import Link from "next/link";
import { ArrowRight, Grid3x3, Sparkles, Target } from "lucide-react";
import { listPlans } from "@/db/queries.ts";
import { createPlan } from "./actions.ts";
import { ActionForm } from "./action-form.tsx";
import { ThemeToggle } from "./theme-toggle.tsx";
import { slotColor } from "@/lib/palette.ts";

// 這頁每次請求都要讀當下的資料，不能在 build 時預渲染。
export const dynamic = "force-dynamic";

export default async function Home() {
  const plans = await listPlans();

  return (
    <main className="w-full mx-auto max-w-3xl px-6 py-10 md:py-16 flex flex-col gap-12">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-line bg-surface px-3 py-1 text-xs text-dim">
            <Sparkles size={13} className="text-accent-text" />
            曼陀羅計劃表
          </span>
          <h1 className="display text-4xl md:text-5xl font-semibold leading-[1.05]">
            Open Window
            <span className="ml-2 bg-gradient-to-br from-accent to-[oklch(0.68_0.17_232)] bg-clip-text text-transparent">
              64
            </span>
          </h1>
          <p className="text-dim max-w-md leading-relaxed">
            一個核心目標，拆成 8 個次目標，再拆成 64 個具體行為。
            然後每天把它們一格一格填滿。
          </p>
        </div>
        <ThemeToggle />
      </header>

      <section className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow)]">
        <ActionForm action={createPlan} className="flex flex-col gap-3">
          <label htmlFor="title" className="flex items-center gap-2 text-sm font-medium">
            <Target size={16} className="text-accent-text" />
            新的計劃表：你的核心目標是什麼？
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="title"
              name="title"
              className="flex-1 rounded-xl border border-line bg-bg px-4 py-2.5 outline-none focus:border-accent"
              placeholder="例如：2027 年跑完一場全馬"
            />
            <button
              type="submit"
              className="lift inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent px-5 py-2.5 font-medium text-black cursor-pointer"
            >
              建立
              <ArrowRight size={16} />
            </button>
          </div>
        </ActionForm>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-dim">我的計劃表</h2>
        {plans.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-dim">
            還沒有任何計劃表。上面建一個，就會展開一張 9×9 的格子。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {plans.map((p, i) => (
              <li key={p.id}>
                <Link
                  href={`/plans/${p.id}`}
                  className="lift group flex items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-4 hover:shadow-[var(--shadow)]"
                >
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                    style={{ backgroundColor: slotColor(i, { dim: true }) }}
                  >
                    <Grid3x3 size={18} className="text-black/70" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
                  <ArrowRight size={16} className="shrink-0 text-dim transition group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
