/**
 * Top of a count axis split into 4 equal whole-number steps of 1, 2, 3 or 5 x 10^k.
 * Keeps gridline labels readable integers without wasting more than ~half the plot height.
 */
export function niceMax(n: number): number {
  const raw = Math.max(1, n) / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 3, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!;
  return Math.max(1, Math.round(step)) * 4;
}
