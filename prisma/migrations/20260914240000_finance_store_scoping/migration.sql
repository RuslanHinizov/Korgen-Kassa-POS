-- Phase 2: scope the Финансы module (accounts, cashboxes, payments, transfers,
-- expense types, business settings) to a specific Store. Existing data all
-- belongs to the one real store seeded as 'store_main'.

-- AlterTable: add storeId (nullable first), backfill, then require it.
ALTER TABLE "FinanceAccount" ADD COLUMN "storeId" TEXT;
UPDATE "FinanceAccount" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "FinanceAccount" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Cashbox" ADD COLUMN "storeId" TEXT;
UPDATE "Cashbox" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "Cashbox" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Cashbox" ADD CONSTRAINT "Cashbox_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD COLUMN "storeId" TEXT;
UPDATE "Payment" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "Payment" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Payment_storeId_idx" ON "Payment"("storeId");

ALTER TABLE "Transfer" ADD COLUMN "storeId" TEXT;
UPDATE "Transfer" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "Transfer" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Transfer_storeId_idx" ON "Transfer"("storeId");

-- ExpenseType: was globally unique on name; becomes unique per store.
DROP INDEX "ExpenseType_name_key";
ALTER TABLE "ExpenseType" ADD COLUMN "storeId" TEXT;
UPDATE "ExpenseType" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "ExpenseType" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "ExpenseType" ADD CONSTRAINT "ExpenseType_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ExpenseType_storeId_name_key" ON "ExpenseType"("storeId", "name");

-- BusinessSettings: was a hardcoded singleton row (id='singleton'); becomes one row per store.
ALTER TABLE "BusinessSettings" ADD COLUMN "storeId" TEXT;
UPDATE "BusinessSettings" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "BusinessSettings" ALTER COLUMN "storeId" SET NOT NULL;
CREATE UNIQUE INDEX "BusinessSettings_storeId_key" ON "BusinessSettings"("storeId");
ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
