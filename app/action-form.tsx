"use client";

import { useActionState, useState } from "react";
import type { Result } from "./actions.ts";

export type FormState = {
  pending: boolean;
  error?: string;
  /**
   * 成功送出過幾次。0 代表還沒成功過。
   *
   * 為什麼是計數而不是布林：成功回饋要能**重播**。布林第二次存檔時值沒變，
   * React 不會重掛那個元素，動畫就不會再跑一次，使用者看不到第二次的回應。
   * 拿它當 key，每次成功都是一個新元素，CSS 自己淡出，不需要 setTimeout 收尾。
   */
  saved: number;
};

// ponytail: 所有寫入表單共用這一個殼，只負責顯示錯誤與 pending。
// 欄位由呼叫端自己放，不做欄位抽象。
export function ActionForm({
  action,
  className,
  compact,
  children,
}: {
  action: (prev: Result, form: FormData) => Promise<Result>;
  className?: string;
  /** 放在格子裡時用：錯誤縮成一個紅點，訊息掛在 title，不然一行紅字會把格子撐爛。 */
  compact?: boolean;
  /** 傳函式進來就能拿到 pending 與 saved，用來做樂觀回饋與「已儲存」。 */
  children: React.ReactNode | ((state: FormState) => React.ReactNode);
}) {
  const [saved, setSaved] = useState(0);
  // ponytail: 包一層 client 函式換取 saved 計數，代價是失去「沒有 JS 也能送出」。
  // 這個 app 的盤面本來就要 JS 才點得開面板，那條路徑從來沒有支援過。
  const [state, formAction, pending] = useActionState(async (prev: Result, form: FormData) => {
    const res = await action(prev, form);
    // 導向是靠丟例外運作的，跑到這裡就代表真的寫完了。
    if (!res?.error) setSaved((n) => n + 1);
    return res;
  }, {});

  return (
    <form action={formAction} className={className} data-pending={pending || undefined}>
      {typeof children === "function" ? children({ pending, error: state.error, saved }) : children}
      {state.error ? (
        compact ? (
          <span
            title={state.error}
            role="alert"
            className="absolute -left-0.5 -top-0.5 block h-2 w-2 rounded-full bg-red-500"
          />
        ) : (
          <p role="alert" className="text-xs text-red-600 leading-tight">{state.error}</p>
        )
      ) : null}
    </form>
  );
}

/**
 * 「已儲存」那一下。呼叫端一定要給 `key={saved}`，否則第二次不會重播。
 * 用 role="status" 讓讀螢幕的人也收得到——視覺回饋不能只有看得到的人拿得到。
 */
export function Saved({ children = "已儲存", className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <span role="status" className={`flash text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}
