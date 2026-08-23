"use client";

import { useSyncExternalStore } from "react";
import { localDay } from "@/lib/day.ts";

/** 只有瀏覽器算得準當地日期；SSR 時給空字串，避免 hydration mismatch。 */
export function useToday() {
  return useSyncExternalStore(() => () => {}, () => localDay(), () => "");
}
