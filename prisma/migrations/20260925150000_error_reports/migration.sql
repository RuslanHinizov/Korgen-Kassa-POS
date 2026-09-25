-- Automatic error reports (client, server, api), grouped by fingerprint.
CREATE TYPE "ErrorSource" AS ENUM ('CLIENT', 'SERVER', 'API');
CREATE TYPE "ErrorStatus" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE "ErrorReport" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "source" "ErrorSource" NOT NULL,
  "message" TEXT NOT NULL,
  "stack" TEXT,
  "path" TEXT,
  "method" TEXT,
  "count" INTEGER NOT NULL DEFAULT 1,
  "status" "ErrorStatus" NOT NULL DEFAULT 'OPEN',
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastStoreId" TEXT,
  "lastStoreName" TEXT,
  "lastUserName" TEXT,
  "lastUserRole" TEXT,
  "lastUserPhone" TEXT,
  "lastUserAgent" TEXT,
  "storeIds" TEXT[],
  CONSTRAINT "ErrorReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ErrorReport_fingerprint_key" ON "ErrorReport"("fingerprint");
CREATE INDEX "ErrorReport_status_lastSeenAt_idx" ON "ErrorReport"("status", "lastSeenAt");
