-- CreateEnum
CREATE TYPE "StockInStatus" AS ENUM ('DRAFT', 'POSTED');

-- CreateTable
CREATE TABLE "StockIn" (
    "id" TEXT NOT NULL,
    "documentNo" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "StockInStatus" NOT NULL DEFAULT 'DRAFT',
    "stockInDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "totalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockInItem" (
    "id" TEXT NOT NULL,
    "stockInId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unitCost" DECIMAL(10,2),
    "note" TEXT,

    CONSTRAINT "StockInItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockIn_status_stockInDate_idx" ON "StockIn"("status", "stockInDate");

-- CreateIndex
CREATE INDEX "StockInItem_stockInId_idx" ON "StockInItem"("stockInId");

-- CreateIndex
CREATE INDEX "StockInItem_productId_idx" ON "StockInItem"("productId");

-- AddForeignKey
ALTER TABLE "StockIn" ADD CONSTRAINT "StockIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockInItem" ADD CONSTRAINT "StockInItem_stockInId_fkey" FOREIGN KEY ("stockInId") REFERENCES "StockIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockInItem" ADD CONSTRAINT "StockInItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
