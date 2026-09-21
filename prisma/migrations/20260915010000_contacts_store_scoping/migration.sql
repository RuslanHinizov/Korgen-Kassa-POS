-- Phase 3b: scope contact records (Supplier, Customer, Consultant, DiscountCard)
-- to a specific Store. Existing data all belongs to the one real store seeded
-- as 'store_main'. Real UMAG confirmed live: Suppliers are fully separate per
-- store (455 vs 5 rows on two real stores) — Customer/Consultant/DiscountCard
-- follow the same per-store model for consistency (no live UMAG data existed
-- to test those three directly).

-- Supplier
ALTER TABLE "Supplier" ADD COLUMN "storeId" TEXT;
UPDATE "Supplier" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "Supplier" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Supplier_storeId_idx" ON "Supplier"("storeId");

-- Customer: phone/email were globally unique; become unique per store.
DROP INDEX "Customer_phone_key";
DROP INDEX "Customer_email_key";
ALTER TABLE "Customer" ADD COLUMN "storeId" TEXT;
UPDATE "Customer" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "Customer" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Customer_storeId_phone_key" ON "Customer"("storeId", "phone");
CREATE UNIQUE INDEX "Customer_storeId_email_key" ON "Customer"("storeId", "email");
CREATE INDEX "Customer_storeId_idx" ON "Customer"("storeId");

-- Consultant
ALTER TABLE "Consultant" ADD COLUMN "storeId" TEXT;
UPDATE "Consultant" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "Consultant" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Consultant" ADD CONSTRAINT "Consultant_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Consultant_storeId_idx" ON "Consultant"("storeId");

-- DiscountCard: code was globally unique; becomes unique per store.
DROP INDEX "DiscountCard_code_key";
ALTER TABLE "DiscountCard" ADD COLUMN "storeId" TEXT;
UPDATE "DiscountCard" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "DiscountCard" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "DiscountCard" ADD CONSTRAINT "DiscountCard_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "DiscountCard_storeId_code_key" ON "DiscountCard"("storeId", "code");
CREATE INDEX "DiscountCard_storeId_idx" ON "DiscountCard"("storeId");
