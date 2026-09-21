-- DropIndex
DROP INDEX "Sale_fiscalStatus_idx";

-- AlterTable
ALTER TABLE "BusinessSettings" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Cashbox" ADD COLUMN     "pairedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "cashboxId" TEXT;

-- CreateIndex
CREATE INDEX "PurchaseReceiptPayment_accountId_idx" ON "PurchaseReceiptPayment"("accountId");

-- CreateIndex
CREATE INDEX "SupplierReturnPayment_accountId_idx" ON "SupplierReturnPayment"("accountId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cashboxId_fkey" FOREIGN KEY ("cashboxId") REFERENCES "Cashbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

