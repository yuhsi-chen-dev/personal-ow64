import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Grid3x3, LogOut, Sparkles, Target, Trash2 } from "lucide-react";
import { auth } from "@/auth.ts";
import { listPlans } from "@/db/queries.ts";
import { createPlan, removePlan } from "../actions.ts";
import { signOutOfApp } from "../auth-actions.ts";
import { ActionForm } from "../action-form.tsx";
import { ConfirmButton } from "../confirm-button.tsx";
import { ThemeToggle } from "../theme-toggle.tsx";
import { slotColor } from "@/lib/palette.ts";

// 這頁每次請求都要讀當下的資料，不能在 build 時預渲染。
export const dynamic = "force-dynamic";

/** 刪掉這份計劃表會失去什麼。整份表是 cascade 真刪，沒有復原入口，所以要把代價講清楚。 */
function cost({ subGoals, actions, logs }: { subGoals: number; actions: number; logs: number }) {
  // 是 0 的就不要唸出來——「0 項行為」只是雜訊，讀的人要的是還剩什麼會沒。
  const parts = [
    subGoals ? `${subGoals} 個次目標` : "",
    actions ? `${actions} 項行為` : "",
    logs ? `${logs} 筆紀錄` : "",
  ].filter(Boolean);
  return parts.length === 0 ? "這份還是空的" : `連同 ${parts.join("、")}`;
}

export default async function Dashboard() {
  const session = await auth();
  const userId = session?.user?.id;
  // 這頁是私人的，沒登入就回首頁那張公開的介紹。
  if (!userId) redirect("/");

  const plans = await listPlans(userId);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-5 py-10 sm:px-6 md:py-16">
      {/*
        兩段式：上面一列放 tag 與右邊的按鈕，標題自己獨佔一整列。
        原本是「左邊一整欄 vs 右邊按鈕」，手機上按鈕把標題擠到只剩半個螢幕，
        「Open Window 64」就被折成兩行。標題不跟按鈕搶寬度就沒這回事。

        說明文字拿掉了。這頁是每天要開的工作頁，不是介紹頁——那句話你第一天就讀完了，
        之後每次打開都只是要略過的一行。想看介紹，頁尾有「關於 Open Window 64」。
      */}
      <header className="flex flex-col gap-3">
        {/*
          三個東西同一個高度（h-9）：左邊的 tag、登出、主題切換。
          原本 tag 26px、登出 44px、主題 36px，三種高度排在一列會看起來沒對齊。
          登出縮成 36px 之後觸控高度不夠，改用 .tap 的偽元素把可點區域撐回 44pt。

          flex-wrap + ml-auto：窄螢幕上「曼陀羅計劃表 · Mandal-Art」加兩顆按鈕擠不進一列，
          就讓按鈕整組掉到第二列並靠右，而不是把 tag 壓扁或讓它溢出。
        */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-xs text-dim">
            <Sparkles size={13} className="shrink-0 text-accent-text" />
            曼陀羅計劃表 · Mandal-Art
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <form action={signOutOfApp}>
              <button
                type="submit"
                title={session?.user?.email ?? undefined}
                className="lift tap inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-xs text-dim hover:text-text cursor-pointer"
              >
                <LogOut size={13} />
                登出
              </button>
            </form>
            <ThemeToggle />
          </div>
        </div>
        <h1 className="display text-[2.125rem] leading-[1.1] font-semibold sm:text-4xl md:text-5xl md:leading-[1.05]">
          Open Window
          <span className="ml-2 bg-gradient-to-br from-accent to-[oklch(0.68_0.17_232)] bg-clip-text text-transparent">
            64
          </span>
        </h1>
      </header>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)] sm:p-6">
        <ActionForm action={createPlan} className="flex flex-col gap-3">
          <label htmlFor="title" className="flex items-center gap-2 text-sm leading-snug font-medium">
            <Target size={16} className="shrink-0 text-accent-text" />
            新的計劃表：你的核心目標是什麼？
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="title"
              name="title"
              className="min-h-11 flex-1 rounded-xl border border-line bg-bg px-4 py-2.5 outline-none focus:border-accent"
              placeholder="例如：2027 年跑完一場全馬"
            />
            <button
              type="submit"
              className="lift inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-accent px-5 py-2.5 font-medium text-black cursor-pointer"
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
          <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm leading-[1.9] text-dim text-pretty">
            還沒有任何計劃表。上面建一個，就會展開一張 9×9 的格子。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {plans.map((p, i) => (
              // 刪除的表單不能包在 Link 裡（互動元素不可巢狀），所以兩者並排。
              <li
                key={p.id}
                // flex-wrap + basis：確認狀態多出一行字，窄螢幕上讓它整組換行，
                // 而不是把計劃表名稱擠到看不見——正在刪哪一份是最不能被擠掉的資訊。
                className="lift group flex flex-wrap items-center gap-y-1 rounded-2xl border border-line bg-surface pr-3 hover:shadow-[var(--shadow)]"
              >
                <Link href={`/plans/${p.id}`} className="flex min-w-0 grow basis-60 items-center gap-3 px-5 py-4">
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                    style={{ backgroundColor: slotColor(i, { dim: true }) }}
                  >
                    <Grid3x3 size={18} className="text-black/70" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
                  <ArrowRight size={16} className="shrink-0 text-dim transition group-hover:translate-x-0.5" />
                </Link>
                <ActionForm action={removePlan} className="ml-auto shrink-0 pb-2 sm:pb-0">
                  <input type="hidden" name="planId" value={p.id} />
                  <ConfirmButton
                    className="tap grid h-9 w-9 place-items-center rounded-full text-dim hover:bg-surface-2 hover:text-red-600 cursor-pointer"
                    confirmClassName="whitespace-nowrap rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
                    idle={<Trash2 size={15} />}
                    confirm="確定刪除"
                    note={cost(p.counts)}
                  />
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-6 text-sm text-dim">
        {/*
          回介紹頁的唯一入口，刻意放頁尾而不是標題列。
          標題連首頁是網站的慣例，但這裡的「主畫面」是 /dashboard 不是 /——
          讓每天要用的人點到一頁行銷文案，是把慣例套錯地方。
          真正要用到它的情境只有一個：想把這個 app 介紹給別人、想看看對方會看到什麼。
          那是不常用但要找得到的東西，頁尾正是它該待的地方。
        */}
        <Link href="/" className="min-h-11 content-center hover:text-text">
          關於 Open Window 64
        </Link>
        <Link href="/privacy" target="_blank" className="min-h-11 content-center hover:text-text">
          隱私權政策
        </Link>
        <Link href="/terms" target="_blank" className="min-h-11 content-center hover:text-text">
          服務條款
        </Link>
      </footer>
    </main>
  );
}
