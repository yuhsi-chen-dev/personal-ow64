"use client";

import { useActionState } from "react";
import type { Result } from "./actions.ts";

// ponytail: 所有寫入表單共用這一個殼，只負責顯示錯誤與 pending。
// 欄位由呼叫端自己放，不做欄位抽象。
export function ActionForm({
  action,
  className,
  children,
}: {
  action: (prev: Result, form: FormData) => Promise<Result>;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className} data-pending={pending || undefined}>
      {children}
      {state.error ? <p className="text-[10px] text-red-600 leading-tight">{state.error}</p> : null}
    </form>
  );
}
