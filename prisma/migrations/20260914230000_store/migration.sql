-- CreateTable
CREATE TABLE "Store" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- Seed the one real store from the existing BusinessSettings name, with a fixed id
-- so later migrations can reference it directly for backfilling storeId columns.
INSERT INTO "Store" ("id", "name", "createdAt", "updatedAt")
SELECT 'store_main', COALESCE((SELECT "name" FROM "BusinessSettings" WHERE "id" = 'singleton'), 'Моя компания'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Store" WHERE "id" = 'store_main');
