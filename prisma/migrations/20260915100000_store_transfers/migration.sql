-- Товары → Перемещение: inter-store product transfer.
ALTER TYPE "InventoryMovementType" ADD VALUE 'TRANSFER_OUT';
ALTER TYPE "InventoryMovementType" ADD VALUE 'TRANSFER_IN';

CREATE TYPE "StoreTransferStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

CREATE TABLE "StoreTransfer" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "documentNo" SERIAL NOT NULL,
    "toStoreId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "StoreTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "comment" TEXT,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" TIMESTAMP(3),

    CONSTRAINT "StoreTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoreTransferItem" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unitCost" DECIMAL(10,2),
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "StoreTransferItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StoreTransfer_status_createdAt_idx" ON "StoreTransfer"("status", "createdAt");
CREATE INDEX "StoreTransfer_storeId_idx" ON "StoreTransfer"("storeId");
CREATE INDEX "StoreTransfer_toStoreId_idx" ON "StoreTransfer"("toStoreId");
CREATE INDEX "StoreTransferItem_transferId_idx" ON "StoreTransferItem"("transferId");
CREATE INDEX "StoreTransferItem_productId_idx" ON "StoreTransferItem"("productId");

ALTER TABLE "StoreTransfer" ADD CONSTRAINT "StoreTransfer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreTransfer" ADD CONSTRAINT "StoreTransfer_toStoreId_fkey" FOREIGN KEY ("toStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StoreTransfer" ADD CONSTRAINT "StoreTransfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StoreTransferItem" ADD CONSTRAINT "StoreTransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StoreTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreTransferItem" ADD CONSTRAINT "StoreTransferItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
