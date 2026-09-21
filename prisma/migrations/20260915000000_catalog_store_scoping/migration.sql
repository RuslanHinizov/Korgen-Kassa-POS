-- Phase 3a: scope the core catalog (Category, Product, ProductArticle,
-- QuickProductGroup) to a specific Store. Existing data all belongs to the
-- one real store seeded as 'store_main'. Real UMAG confirmed live: Product
-- and Supplier catalogs are fully separate per store.

-- Category: was globally unique on (parentId, name); becomes unique per store.
DROP INDEX "Category_parentId_name_key";
ALTER TABLE "Category" ADD COLUMN "storeId" TEXT;
UPDATE "Category" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "Category" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Category" ADD CONSTRAINT "Category_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Category_storeId_parentId_name_key" ON "Category"("storeId", "parentId", "name");
CREATE INDEX "Category_storeId_idx" ON "Category"("storeId");

-- Product: barcode/scalePlu were globally unique; become unique per store.
DROP INDEX "Product_barcode_key";
DROP INDEX "Product_scalePlu_key";
ALTER TABLE "Product" ADD COLUMN "storeId" TEXT;
UPDATE "Product" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "Product" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Product_storeId_barcode_key" ON "Product"("storeId", "barcode");
CREATE UNIQUE INDEX "Product_storeId_scalePlu_key" ON "Product"("storeId", "scalePlu");
CREATE INDEX "Product_storeId_idx" ON "Product"("storeId");

-- ProductArticle: was globally unique on code; becomes unique per store.
DROP INDEX "ProductArticle_code_key";
ALTER TABLE "ProductArticle" ADD COLUMN "storeId" TEXT;
UPDATE "ProductArticle" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "ProductArticle" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "ProductArticle" ADD CONSTRAINT "ProductArticle_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ProductArticle_storeId_code_key" ON "ProductArticle"("storeId", "code");
CREATE INDEX "ProductArticle_storeId_idx" ON "ProductArticle"("storeId");

-- QuickProductGroup: was globally unique on name; becomes unique per store.
DROP INDEX "QuickProductGroup_name_key";
ALTER TABLE "QuickProductGroup" ADD COLUMN "storeId" TEXT;
UPDATE "QuickProductGroup" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "QuickProductGroup" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "QuickProductGroup" ADD CONSTRAINT "QuickProductGroup_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "QuickProductGroup_storeId_name_key" ON "QuickProductGroup"("storeId", "name");
