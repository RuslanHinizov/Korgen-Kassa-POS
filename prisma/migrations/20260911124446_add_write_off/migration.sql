-- CreateEnum
CREATE TYPE "WriteOffStatus" AS ENUM ('DRAFT', 'POSTED');

-- CreateEnum
CREATE TYPE "WriteOffReason" AS ENUM ('DAMAGED', 'EXPIRED', 'THEFT', 'OTHER');

-- CreateTable
CREATE TABLE "WriteOff" (
    "id" TEXT NOT NULL,
    "documentNo" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "WriteOffStatus" NOT NULL DEFAULT 'DRAFT',
    "writeOffDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "totalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WriteOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WriteOffItem" (
    "id" TEXT NOT NULL,
    "writeOffId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "reason" "WriteOffReason" NOT NULL DEFAULT 'OTHER',
    "unitCost" DECIMAL(10,2),
    "note" TEXT,

    CONSTRAINT "WriteOffItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WriteOff_status_writeOffDate_idx" ON "WriteOff"("status", "writeOffDate");

-- CreateIndex
CREATE INDEX "WriteOffItem_writeOffId_idx" ON "WriteOffItem"("writeOffId");

-- CreateIndex
CREATE INDEX "WriteOffItem_productId_idx" ON "WriteOffItem"("productId");

-- AddForeignKey
ALTER TABLE "WriteOff" ADD CONSTRAINT "WriteOff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriteOffItem" ADD CONSTRAINT "WriteOffItem_writeOffId_fkey" FOREIGN KEY ("writeOffId") REFERENCES "WriteOff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriteOffItem" ADD CONSTRAINT "WriteOffItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
