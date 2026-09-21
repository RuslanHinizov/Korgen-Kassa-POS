-- Faz C: 9 more "Настройка разрешений на сайте" checkboxes.
ALTER TABLE "BusinessSettings"
  ADD COLUMN "mergeSameProducts" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "bindProductToSupplier" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "autosaveReceiptDraft" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "showContragentsPerStore" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "autoUpdateCostPrice" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "autoUpdateBundleSalePrice" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cashbackEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hideStockDuringStocktake" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hideAmountsDuringStocktake" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Category" ADD COLUMN "cashbackPercent" DOUBLE PRECISION;
