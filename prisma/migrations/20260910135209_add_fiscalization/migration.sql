-- AlterTable: BusinessSettings — WebKassa fiscalisation config
ALTER TABLE "BusinessSettings" ADD COLUMN "fiscalEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BusinessSettings" ADD COLUMN "fiscalProvider" TEXT NOT NULL DEFAULT 'webkassa';
ALTER TABLE "BusinessSettings" ADD COLUMN "fiscalBaseUrl" TEXT NOT NULL DEFAULT 'https://devkkm.webkassa.kz';
ALTER TABLE "BusinessSettings" ADD COLUMN "fiscalApiKey" TEXT;
ALTER TABLE "BusinessSettings" ADD COLUMN "fiscalLogin" TEXT;
ALTER TABLE "BusinessSettings" ADD COLUMN "fiscalPassword" TEXT;
ALTER TABLE "BusinessSettings" ADD COLUMN "fiscalCashboxId" TEXT;
ALTER TABLE "BusinessSettings" ADD COLUMN "fiscalVatEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BusinessSettings" ADD COLUMN "fiscalVatPercent" DECIMAL(5,2) NOT NULL DEFAULT 12;

-- AlterTable: Sale — fiscal result
ALTER TABLE "Sale" ADD COLUMN "fiscalStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Sale" ADD COLUMN "fiscalCheckNumber" TEXT;
ALTER TABLE "Sale" ADD COLUMN "fiscalTicketUrl" TEXT;
ALTER TABLE "Sale" ADD COLUMN "fiscalPrintUrl" TEXT;
ALTER TABLE "Sale" ADD COLUMN "fiscalShiftNumber" INTEGER;
ALTER TABLE "Sale" ADD COLUMN "fiscalOrderNumber" INTEGER;
ALTER TABLE "Sale" ADD COLUMN "fiscalRnm" TEXT;
ALTER TABLE "Sale" ADD COLUMN "fiscalOfflineMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Sale" ADD COLUMN "fiscalExternalId" TEXT;
ALTER TABLE "Sale" ADD COLUMN "fiscalError" TEXT;
ALTER TABLE "Sale" ADD COLUMN "fiscalizedAt" TIMESTAMP(3);

-- Index for the retry sweep
CREATE INDEX "Sale_fiscalStatus_idx" ON "Sale"("fiscalStatus");
