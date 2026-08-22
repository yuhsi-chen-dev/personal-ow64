"use client";

import { useActionState } from "react";
import type { Result } from "./actions.ts";

export type FormState = { pending: boolean; error?: string };

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
  /** 傳函式進來就能拿到 pending，用來做樂觀回饋（按下去立刻變成完成的樣子）。 */
  children: React.ReactNode | ((state: FormState) => React.ReactNode);
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className} data-pending={pending || undefined}>
      {typeof children === "function" ? children({ pending, error: state.error }) : children}
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
