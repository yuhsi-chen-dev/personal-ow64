import Link from "next/link";
import { Grid3x3, LineChart, Sunrise } from "lucide-react";

/**
 * 一份計劃表的三頁是**平行的**，不是巢狀的：格子是地圖、今天是今天要做什麼、回顧是走了多遠。
 * 所以三頁的標題列必須長一樣，永遠看得到另外兩頁的入口——之前是三頁各寫一份，
 * 結果今天頁到不了回顧、回顧頁哪裡都到不了，而且左上的返回鍵在回顧頁指向格子頁、
 * 另外兩頁指向清單，同一顆按鈕三頁兩種意思。
 *
 * 這裡把它收成一個元件，讓「三頁不一致」在結構上不可能發生。
 * 動線本身沒有改，`decisions/0010` 說的「打開一份表＝看地圖」仍然成立。
 */

const BASE = "lift tap grid h-9 w-9 shrink-0 place-items-center rounded-full border";
const IDLE = `${BASE} border-line bg-surface text-dim hover:text-text`;
const ACTIVE = `${BASE} border-transparent bg-accent/15 text-accent-text`;

export type PlanPage = "board" | "today" | "review";

export function PlanNav({ id, current }: { id: string; current: PlanPage }) {
  const tabs = [
    { key: "board", href: `/plans/${id}`, label: "格子", Icon: Grid3x3 },
    { key: "today", href: `/plans/${id}/today`, label: "今天", Icon: Sunrise },
    { key: "review", href: `/plans/${id}/review`, label: "回顧", Icon: LineChart },
  ] as const;

  return (
    <>
      {tabs.map(({ key, href, label, Icon }) =>
        key === current ? (
          // 目前這一頁不做成連結——點得動卻哪裡都不去，是最沒必要的挫折。
          <span key={key} aria-current="page" title={label} className={ACTIVE}>
            <Icon size={16} />
          </span>
        ) : (
          <Link key={key} href={href} aria-label={label} title={label} className={IDLE}>
            <Icon size={16} />
          </Link>
        ),
      )}
    </>
  );
}
