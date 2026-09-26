-- Offline kassa: a sale carries an id made on the till so an upload that is retried never duplicates it.
ALTER TABLE "Sale" ADD COLUMN "clientSaleId" TEXT;
ALTER TABLE "Sale" ADD COLUMN "receiptNo" TEXT;
ALTER TABLE "Sale" ADD COLUMN "offline" BOOLEAN NOT NULL DEFAULT false;

-- NULLs are distinct in PostgreSQL, so ordinary online sales (no clientSaleId) are unaffected.
CREATE UNIQUE INDEX "Sale_storeId_clientSaleId_key" ON "Sale"("storeId", "clientSaleId");
