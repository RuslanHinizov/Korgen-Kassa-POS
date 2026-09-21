-- AlterTable
ALTER TABLE "BusinessSettings"
  ADD COLUMN "allowWholesale" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autoUpdateSalePrice" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "roundSalePriceUp" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "backdatingDays" INTEGER NOT NULL DEFAULT 365;

-- CreateTable
CREATE TABLE "SaleRestriction" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "daysOfWeek" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaleRestriction_categoryId_idx" ON "SaleRestriction"("categoryId");

-- AddForeignKey
ALTER TABLE "SaleRestriction" ADD CONSTRAINT "SaleRestriction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
