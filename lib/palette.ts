// 8 個次目標各自的色相。整張表的顏色來自這裡，不是靠額外的裝飾。
// 用 OKLCH 是為了 8 個顏色在視覺上亮度一致，不會有某一塊特別跳或特別糊。
import { SLOTS } from "./mandala.ts";

/** 色相環上大致等距的 8 個角度，避開了難分辨的相鄰組合。 */
const HUES = [8, 45, 92, 148, 192, 232, 276, 322] as const;

export function slotHue(slot: number): number {
  const h = HUES[((slot % SLOTS) + SLOTS) % SLOTS];
  return h ?? HUES[0];
}

/** 次目標的代表色，用在圖示、外框、面板標題。 */
export function slotColor(slot: number, opts: { dim?: boolean } = {}): string {
  return `oklch(${opts.dim ? "0.78 0.09" : "0.68 0.17"} ${slotHue(slot)})`;
}

/**
 * 格子的熱力圖填色：把該區塊的色相依進度混進 surface。
 * intensity 為 null（沒填）時回傳 surface-2，讓「還沒想到」跟「想到但沒做」不同色。
 */
export function slotFill(slot: number, intensity: number | null): string {
  // 空格子也帶一點該區塊的色相，這樣 8 個區塊即使全空也分得出來。
  // 濃度刻意壓到 7%，跟「有填但 0%」的下限（heat 的 18%）拉開距離。
  if (intensity === null) return `color-mix(in oklab, oklch(0.68 0.17 ${slotHue(slot)}) 7%, var(--surface-2))`;
  const pct = Math.round(intensity * 100);
  return `color-mix(in oklab, oklch(0.68 0.17 ${slotHue(slot)}) ${pct}%, var(--surface))`;
}

/** 核心目標的填色：不屬於任何次目標，用中性的強調色。 */
export function coreFill(intensity: number | null): string {
  if (intensity === null) return "var(--surface-2)";
  return `color-mix(in oklab, var(--accent) ${Math.round(intensity * 100)}%, var(--surface))`;
}
