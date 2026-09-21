
-- AlterTable
ALTER TABLE "CancelledItem" ADD COLUMN     "cashboxId" TEXT;

-- AddForeignKey
ALTER TABLE "CancelledItem" ADD CONSTRAINT "CancelledItem_cashboxId_fkey" FOREIGN KEY ("cashboxId") REFERENCES "Cashbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

