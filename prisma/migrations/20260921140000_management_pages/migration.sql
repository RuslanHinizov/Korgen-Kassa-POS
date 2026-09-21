-- Управление: employee profile fields, dismissal, receipt header/VAT, consultant photo.
ALTER TABLE "User" ADD COLUMN "lastName" TEXT, ADD COLUMN "phone" TEXT, ADD COLUMN "firedAt" TIMESTAMP(3),
  ADD COLUMN "allowCashierLogin" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "cashierCode" TEXT;
CREATE UNIQUE INDEX "User_cashierCode_key" ON "User"("cashierCode");
ALTER TABLE "Consultant" ADD COLUMN "photoUrl" TEXT;
ALTER TABLE "BusinessSettings" ADD COLUMN "receiptHeader" TEXT NOT NULL DEFAULT '', ADD COLUMN "receiptPrintVat" BOOLEAN NOT NULL DEFAULT true;
-- Give every existing employee a barcode code.
UPDATE "User" SET "cashierCode" = lpad((floor(random() * 9000000000) + 1000000000)::bigint::text, 10, '0') WHERE "cashierCode" IS NULL;
