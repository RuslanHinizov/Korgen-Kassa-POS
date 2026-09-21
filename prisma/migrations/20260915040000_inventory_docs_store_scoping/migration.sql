-- Phase 5: scope the remaining inventory/purchasing documents (StockIn,
-- WriteOff, CustomerReturn, PurchaseReceipt, SupplierReturn, GoodsReceipt,
-- Stocktake) to a specific Store. Existing data all belongs to the one real
-- store seeded as 'store_main'. Their line-item/payment child tables need no
-- schema change — they inherit scope via their required parent relation.
-- InventoryMovement, InventoryLot and StockAdjustment also need no schema
-- change — every row has a required productId, and Product already carries
-- storeId (Phase 3a), so they are scoped indirectly via that relation.

ALTER TABLE "StockIn" ADD COLUMN "storeId" TEXT;
UPDATE "StockIn" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "StockIn" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "StockIn" ADD CONSTRAINT "StockIn_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "StockIn_storeId_idx" ON "StockIn"("storeId");

ALTER TABLE "WriteOff" ADD COLUMN "storeId" TEXT;
UPDATE "WriteOff" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "WriteOff" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "WriteOff" ADD CONSTRAINT "WriteOff_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "WriteOff_storeId_idx" ON "WriteOff"("storeId");

ALTER TABLE "CustomerReturn" ADD COLUMN "storeId" TEXT;
UPDATE "CustomerReturn" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "CustomerReturn" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "CustomerReturn" ADD CONSTRAINT "CustomerReturn_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "CustomerReturn_storeId_idx" ON "CustomerReturn"("storeId");

ALTER TABLE "PurchaseReceipt" ADD COLUMN "storeId" TEXT;
UPDATE "PurchaseReceipt" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "PurchaseReceipt" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "PurchaseReceipt_storeId_idx" ON "PurchaseReceipt"("storeId");

ALTER TABLE "SupplierReturn" ADD COLUMN "storeId" TEXT;
UPDATE "SupplierReturn" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "SupplierReturn" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "SupplierReturn_storeId_idx" ON "SupplierReturn"("storeId");

ALTER TABLE "GoodsReceipt" ADD COLUMN "storeId" TEXT;
UPDATE "GoodsReceipt" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "GoodsReceipt" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "GoodsReceipt_storeId_idx" ON "GoodsReceipt"("storeId");

ALTER TABLE "Stocktake" ADD COLUMN "storeId" TEXT;
UPDATE "Stocktake" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "Stocktake" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Stocktake_storeId_idx" ON "Stocktake"("storeId");
