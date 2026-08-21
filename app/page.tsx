import Link from "next/link";
import { listPlans } from "@/db/queries.ts";
import { createPlan } from "./actions.ts";
import { ActionForm } from "./action-form.tsx";

// 這頁每次請求都要讀當下的資料，不能在 build 時預渲染
// （會連不到資料庫，而且預渲染出來的進度是舊的）。
export const dynamic = "force-dynamic";

export default async function Home() {
  const plans = await listPlans();

  return (
    <main className="mx-auto max-w-2xl p-8 flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Open Window 64</h1>

      <ActionForm action={createPlan} className="flex flex-col gap-2">
        <label className="text-sm text-neutral-600" htmlFor="title">
          新的計劃表：你的核心目標是什麼？
        </label>
        <div className="flex gap-2">
          <input
            id="title"
            name="title"
            className="flex-1 border rounded px-3 py-2"
            placeholder="例如：2027 年跑完一場全馬"
          />
          <button type="submit" className="border rounded px-4 py-2 bg-neutral-900 text-white">
            建立
          </button>
        </div>
      </ActionForm>

      <ul className="flex flex-col gap-1">
        {plans.map((p) => (
          <li key={p.id}>
            <Link href={`/plans/${p.id}`} className="underline underline-offset-4">
              {p.title}
            </Link>
          </li>
        ))}
        {plans.length === 0 ? <li className="text-neutral-500 text-sm">還沒有任何計劃表。</li> : null}
      </ul>
    </main>
  );
}
