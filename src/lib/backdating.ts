import { prisma } from "@/lib/db";

/**
 * «Создание документов с задним/передним числом на (дней)»: returns an error message when
 * `date` is further from today than BusinessSettings.backdatingDays, otherwise null.
 */
export async function backdatingError(storeId: string, date: Date | null | undefined): Promise<string | null> {
  if (!date || Number.isNaN(date.getTime())) return null;
  const s = await prisma.businessSettings.findUnique({ where: { storeId }, select: { backdatingDays: true } });
  const limit = s?.backdatingDays ?? 365;
  const dayMs = 86_400_000;
  const diffDays = Math.abs(date.getTime() - Date.now()) / dayMs;
  // A document dated "today" is always fine, even with a limit of 0.
  if (diffDays < 1 || diffDays <= limit) return null;
  return `Дата документа отличается от сегодняшней больше чем на ${limit} дн. (Управление → Настройки разрешений)`;
}
