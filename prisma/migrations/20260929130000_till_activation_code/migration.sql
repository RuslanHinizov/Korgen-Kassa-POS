-- One-time codes an administrator hands out so a new till program can fetch its market package by itself (plan §12).
CREATE TABLE "ActivationCode" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "ActivationCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActivationCode_codeHash_key" ON "ActivationCode"("codeHash");
CREATE INDEX "ActivationCode_storeId_idx" ON "ActivationCode"("storeId");

ALTER TABLE "ActivationCode" ADD CONSTRAINT "ActivationCode_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
