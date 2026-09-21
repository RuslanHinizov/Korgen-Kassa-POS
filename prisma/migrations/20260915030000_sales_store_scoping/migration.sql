-- Phase 4: scope sales-floor transactions (Sale, Shift, HeldOrder) to a
-- specific Store. Existing data all belongs to the one real store seeded as
-- 'store_main'. SaleItem, Refund and CashMovement need no schema change —
-- they are already scoped indirectly via their required parent relation
-- (saleId -> Sale.storeId, shiftId -> Shift.storeId).

ALTER TABLE "Sale" ADD COLUMN "storeId" TEXT;
UPDATE "Sale" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "Sale" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Sale_storeId_idx" ON "Sale"("storeId");

ALTER TABLE "Shift" ADD COLUMN "storeId" TEXT;
UPDATE "Shift" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "Shift" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Shift_storeId_idx" ON "Shift"("storeId");

ALTER TABLE "HeldOrder" ADD COLUMN "storeId" TEXT;
UPDATE "HeldOrder" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "HeldOrder" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "HeldOrder" ADD CONSTRAINT "HeldOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "HeldOrder_storeId_idx" ON "HeldOrder"("storeId");
