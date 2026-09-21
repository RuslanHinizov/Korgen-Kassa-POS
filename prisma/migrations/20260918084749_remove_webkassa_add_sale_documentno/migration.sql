
-- AlterTable
ALTER TABLE "BusinessSettings" DROP COLUMN "fiscalApiKey",
DROP COLUMN "fiscalBaseUrl",
DROP COLUMN "fiscalCashboxId",
DROP COLUMN "fiscalEnabled",
DROP COLUMN "fiscalLogin",
DROP COLUMN "fiscalPassword",
DROP COLUMN "fiscalProvider",
DROP COLUMN "fiscalVatEnabled",
DROP COLUMN "fiscalVatPercent";

-- AlterTable
ALTER TABLE "Sale" DROP COLUMN "fiscalCheckNumber",
DROP COLUMN "fiscalError",
DROP COLUMN "fiscalExternalId",
DROP COLUMN "fiscalOfflineMode",
DROP COLUMN "fiscalOrderNumber",
DROP COLUMN "fiscalPrintUrl",
DROP COLUMN "fiscalRnm",
DROP COLUMN "fiscalShiftNumber",
DROP COLUMN "fiscalStatus",
DROP COLUMN "fiscalTicketUrl",
DROP COLUMN "fiscalizedAt",
ADD COLUMN     "documentNo" SERIAL NOT NULL;

