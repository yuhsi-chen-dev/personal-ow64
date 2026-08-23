"use client";

import { useState } from "react";

/**
 * 兩段式確認：第一下把按鈕換成「確定？」，第二下才真的送出表單。
 *
 * ponytail: 不用 modal，也不用 window.confirm——後者會凍住整個分頁，
 * 而且沒辦法自動測。移開焦點就自動解除武裝。
 */
export function ConfirmButton({
  idle, confirm, note, className, confirmClassName,
}: {
  idle: React.ReactNode;
  confirm: React.ReactNode;
  /** 只在確認那一步出現：這個動作會失去什麼。不可逆的刪除才需要。 */
  note?: React.ReactNode;
  className?: string;
  confirmClassName?: string;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} className={className}>
        {idle}
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      {note ? <span className="text-xs text-dim">{note}</span> : null}
      <button type="submit" autoFocus onBlur={() => setArmed(false)} className={confirmClassName ?? className}>
        {confirm}
      </button>
    </span>
  );
}
