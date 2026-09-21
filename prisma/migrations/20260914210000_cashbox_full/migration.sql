-- CreateEnum
CREATE TYPE "CashboxAccessRole" AS ENUM ('NOBODY', 'ADMIN', 'ALL');
CREATE TYPE "RoundingMode" AS ENUM ('NONE', 'UP_1', 'DOWN_1', 'UP_5', 'DOWN_5', 'UP_10', 'DOWN_10', 'UP_50', 'DOWN_50', 'UP_100', 'DOWN_100');

-- AlterTable Cashbox
ALTER TABLE "Cashbox" ADD COLUMN "no" SERIAL NOT NULL;
ALTER TABLE "Cashbox" ADD COLUMN "oneTimeKey" TEXT;
ALTER TABLE "Cashbox" ADD COLUMN "receiptHeaderText" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Cashbox" ADD COLUMN "receiptFooterText" TEXT NOT NULL DEFAULT 'Спасибо за покупку!';
ALTER TABLE "Cashbox" ADD COLUMN "receiptCyrillicCodepage" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "Cashbox" ADD COLUMN "receiptPaperWidth" INTEGER NOT NULL DEFAULT 58;
ALTER TABLE "Cashbox" ADD COLUMN "receiptTabularView" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Cashbox" ADD COLUMN "receiptPrintVat" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Cashbox" ADD COLUMN "extraAccountId" TEXT;
ALTER TABLE "Cashbox" ADD CONSTRAINT "Cashbox_extraAccountId_fkey" FOREIGN KEY ("extraAccountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable BusinessSettings
ALTER TABLE "BusinessSettings" ADD COLUMN "posCollapseWindow" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BusinessSettings" ADD COLUMN "posInstantSync" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BusinessSettings" ADD COLUMN "posShowSalesHistory" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BusinessSettings" ADD COLUMN "posNewReceiptFormat" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BusinessSettings" ADD COLUMN "posGlobalSearch" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BusinessSettings" ADD COLUMN "posUniversalProduct" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BusinessSettings" ADD COLUMN "posEditProductAtPos" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BusinessSettings" ADD COLUMN "posHoldOrder" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BusinessSettings" ADD COLUMN "posDiscount" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BusinessSettings" ADD COLUMN "posCreditSale" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BusinessSettings" ADD COLUMN "posCashInOut" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BusinessSettings" ADD COLUMN "posSplitCounterparty" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BusinessSettings" ADD COLUMN "posWholesaleAtPos" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BusinessSettings" ADD COLUMN "posPriceCheck" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BusinessSettings" ADD COLUMN "posBanPriceDecrease" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BusinessSettings" ADD COLUMN "posChangePriceAtPos" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BusinessSettings" ADD COLUMN "posCardPayment" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BusinessSettings" ADD COLUMN "posSalesOverMillion" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BusinessSettings" ADD COLUMN "posAccessReturn" "CashboxAccessRole" NOT NULL DEFAULT 'ALL';
ALTER TABLE "BusinessSettings" ADD COLUMN "posAccessReturnNoReceipt" "CashboxAccessRole" NOT NULL DEFAULT 'ALL';
ALTER TABLE "BusinessSettings" ADD COLUMN "posAccessDeleteItem" "CashboxAccessRole" NOT NULL DEFAULT 'ALL';
ALTER TABLE "BusinessSettings" ADD COLUMN "posAccessDecreaseQty" "CashboxAccessRole" NOT NULL DEFAULT 'ALL';
ALTER TABLE "BusinessSettings" ADD COLUMN "posRoundingWeightItems" "RoundingMode" NOT NULL DEFAULT 'UP_1';
ALTER TABLE "BusinessSettings" ADD COLUMN "posRoundingDiscount" "RoundingMode" NOT NULL DEFAULT 'UP_1';
