-- AlterTable
ALTER TABLE "Cashbox" ADD COLUMN     "appVersion" TEXT,
ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "platform" TEXT;
