/**
 * Запреты на продажу на кассе — is a recurring category+time-window sale ban
 * active right now? Same daysOfWeek/startTime/endTime convention as Promotion
 * (see src/lib/promotions.ts isPromotionLive) — kept as a separate, tiny
 * helper since a sale restriction has no percent/amount fields to evaluate.
 */
export interface SaleRestrictionRule {
  id: string;
  categoryId: string;
  categoryName: string;
  active: boolean;
  daysOfWeek: string | null; // "1,2,3,4,5,6,7" — 1=Mon … 7=Sun
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
}

export function isRestrictionLive(rule: SaleRestrictionRule, now = new Date()): boolean {
  if (!rule.active) return false;
  if (rule.daysOfWeek) {
    const iso = now.getDay() === 0 ? 7 : now.getDay();
    if (!rule.daysOfWeek.split(",").map((s) => s.trim()).includes(String(iso))) return false;
  }
  const mins = now.getHours() * 60 + now.getMinutes();
  const toM = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const a = toM(rule.startTime), b = toM(rule.endTime);
  return a <= b ? mins >= a && mins <= b : mins >= a || mins <= b; // handles overnight windows
}

/** First category (by cart order) currently blocked by a live restriction, or null. */
export function findBlockedCategory(
  categoryIds: (string | null | undefined)[],
  rules: SaleRestrictionRule[],
  now = new Date(),
): SaleRestrictionRule | null {
  const live = rules.filter((r) => isRestrictionLive(r, now));
  if (!live.length) return null;
  for (const catId of categoryIds) {
    if (!catId) continue;
    const hit = live.find((r) => r.categoryId === catId);
    if (hit) return hit;
  }
  return null;
}
