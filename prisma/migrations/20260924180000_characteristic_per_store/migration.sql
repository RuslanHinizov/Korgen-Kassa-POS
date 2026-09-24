-- Characteristics were one global vocabulary shared by every market; they now belong to a store.
ALTER TABLE "ProductCharacteristic" ADD COLUMN "storeId" TEXT;
UPDATE "ProductCharacteristic" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "ProductCharacteristic" ALTER COLUMN "storeId" SET NOT NULL;
DROP INDEX IF EXISTS "ProductCharacteristic_name_key";
CREATE UNIQUE INDEX "ProductCharacteristic_storeId_name_key" ON "ProductCharacteristic"("storeId", "name");
CREATE INDEX "ProductCharacteristic_storeId_idx" ON "ProductCharacteristic"("storeId");
ALTER TABLE "ProductCharacteristic" ADD CONSTRAINT "ProductCharacteristic_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
