/** Expands a sold/returned line into the actual stock-affecting product lines:
 * a BUNDLE (Комплект) decrements its component products instead of itself,
 * a SERVICE (Услуга) has no stock at all, a REGULAR product decrements itself.
 * Call inside the same transaction that will apply the inventory movement.
 */
export async function resolveStockLines(
  tx: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  productId: string,
  quantity: number
): Promise<{ productId: string; quantity: number }[]> {
  const product = await tx.product.findUnique({ where: { id: productId }, select: { productType: true } });
  if (!product || product.productType === "REGULAR") return [{ productId, quantity }];
  if (product.productType === "SERVICE") return [];

  const items = await tx.bundleItem.findMany({ where: { bundleId: productId }, select: { componentId: true, quantity: true } });
  return items.map((i: { componentId: string; quantity: unknown }) => ({ productId: i.componentId, quantity: Number(i.quantity) * quantity }));
}

/** Recompute cost + sale price of every Комплект that uses `componentId` as a
 * component, after that component's own cost changed (BusinessSettings.autoUpdateBundleSalePrice).
 * Markup source: the bundle's category defaultMarkup if set, else its own current price/cost ratio
 * (preserved), else sold at cost. Call inside the same transaction as the cost change.
 */
export async function recomputeBundlesUsing(tx: any, componentId: string): Promise<void> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const usages = await tx.bundleItem.findMany({ where: { componentId }, select: { bundleId: true } });
  const bundleIds = [...new Set(usages.map((u: { bundleId: string }) => u.bundleId))] as string[];

  for (const bundleId of bundleIds) {
    const bundle = await tx.product.findUnique({
      where: { id: bundleId },
      select: { cost: true, price: true, bundleExtraCost: true, categoryId: true },
    });
    if (!bundle) continue;

    const items = await tx.bundleItem.findMany({ where: { bundleId }, select: { componentId: true, quantity: true } });
    const components = await tx.product.findMany({ where: { id: { in: items.map((i: { componentId: string }) => i.componentId) } }, select: { id: true, cost: true, price: true } });
    const costById = new Map<string, number>(components.map((c: { id: string; cost: unknown; price: unknown }) => [c.id, Number(c.cost ?? c.price ?? 0)]));

    const newCost = items.reduce((sum: number, i: { componentId: string; quantity: unknown }) => sum + (costById.get(i.componentId) ?? 0) * Number(i.quantity), 0)
      + Number(bundle.bundleExtraCost ?? 0);

    const category = bundle.categoryId ? await tx.category.findUnique({ where: { id: bundle.categoryId }, select: { defaultMarkup: true } }) : null;
    const oldCost = Number(bundle.cost ?? 0);
    const markup = category?.defaultMarkup != null ? category.defaultMarkup / 100 : oldCost > 0 ? Number(bundle.price) / oldCost - 1 : 0;
    const newPrice = newCost * (1 + markup);

    await tx.product.update({ where: { id: bundleId }, data: { cost: newCost, price: newPrice } });
  }
}
