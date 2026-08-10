/** Map week index (1-based) to month 0-11 */
export function weekIndexToMonth(weekIndex: number): number {
  return Math.min(11, Math.max(0, Math.floor((weekIndex - 1) / 4.345)));
}
