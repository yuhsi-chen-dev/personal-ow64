"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

const KEY = "ow64-theme";
const listeners = new Set<() => void>();

function current(): "light" | "dark" {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function ThemeToggle() {
  // SSR 時無從得知使用者的主題，先當成 light，掛載後才是真的。
  const theme = useSyncExternalStore(subscribe, current, () => "light" as const);
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => {
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem(KEY, next);
        listeners.forEach((fn) => fn());
      }}
      aria-label={next === "dark" ? "切換到深色模式" : "切換到淺色模式"}
      title={next === "dark" ? "深色模式" : "淺色模式"}
      className="lift grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-dim hover:text-text cursor-pointer"
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
