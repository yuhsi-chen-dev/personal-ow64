"use client";

import { useEffect, useRef } from "react";
import { localDay } from "@/lib/day.ts";

/**
 * 打卡的日期只有瀏覽器算得準，因為只有它知道使用者的時區。
 * 伺服器端算出來的是 UTC 日，跨時區會記錯天。
 *
 * ponytail: 掛載後直接寫進 DOM 的 value，不走 state——SSR 時是空字串，
 * 所以不會 hydration mismatch。代價是關掉 JS 就打不了卡，
 * 但這頁的錯誤顯示本來就依賴 client component。
 */
export function LocalDayInput() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.value = localDay();
  }, []);
  return <input ref={ref} type="hidden" name="day" defaultValue="" />;
}
