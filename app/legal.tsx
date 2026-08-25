import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * 隱私權政策與服務條款共用的外框。這兩頁是 Google 品牌驗證的必填欄位，
 * 也是實際會被人讀的東西——所以內容寫實話，不要抄一份用不到的模板。
 */

/** 出問題或要刪資料時寄到哪裡。品牌頁與這兩頁必須一致。 */
export const CONTACT_EMAIL = "yuhsi.tw@gmail.com";

/** 信箱一律用 mailto 連結：手機上要能直接點開寄信，不是讓人抄下來。 */
export function ContactEmail() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="break-all text-accent-text hover:underline hover:underline-offset-4">
      {CONTACT_EMAIL}
    </a>
  );
}

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 py-10 sm:px-6 md:py-16">
      <div className="flex flex-col gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-dim hover:text-text"
        >
          <ArrowLeft size={14} />
          回首頁
        </Link>
        <h1 className="display text-3xl leading-[1.35] font-semibold sm:text-4xl sm:leading-[1.25]">{title}</h1>
        <p className="text-sm text-dim">最後更新：{updated}</p>
      </div>
      {/* 中文長段落給大一點的行高；標題與段落之間的距離靠 space-y 一次定好，不要每段各寫一次 */}
      <div className="flex flex-col gap-7 leading-[1.9] text-pretty [&_h2]:text-lg [&_h2]:font-medium [&_p]:text-dim [&_li]:text-dim [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5 [&_li]:list-disc">
        {children}
      </div>
    </main>
  );
}

/** 一節：小標 + 內容，間距統一。 */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
