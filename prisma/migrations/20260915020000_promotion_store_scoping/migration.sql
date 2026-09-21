-- Phase 3c: scope Promotion to a specific Store. Existing data all belongs
-- to the one real store seeded as 'store_main'. SaleRestriction needs no
-- schema change — it is already scoped indirectly via its required
-- categoryId -> Category.storeId relation (Category was scoped in Phase 3a).

ALTER TABLE "Promotion" ADD COLUMN "storeId" TEXT;
UPDATE "Promotion" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "Promotion" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Promotion_storeId_idx" ON "Promotion"("storeId");
