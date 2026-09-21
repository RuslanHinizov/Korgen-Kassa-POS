-- CreateEnum
CREATE TYPE "FinanceAccountType" AS ENUM ('CASH', 'NONCASH');
CREATE TYPE "PaymentDirection" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "FinanceAccount" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "FinanceAccountType" NOT NULL DEFAULT 'CASH',
  "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "allowNegativeBalance" BOOLEAN NOT NULL DEFAULT false,
  "showAtPos" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExpenseType" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "manageable" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ExpenseType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExpenseType_name_key" ON "ExpenseType"("name");

CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "documentNo" SERIAL NOT NULL,
  "direction" "PaymentDirection" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "expenseTypeId" TEXT,
  "accountId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");
CREATE INDEX "Payment_accountId_idx" ON "Payment"("accountId");

-- AlterTable (nullable first; backfilled below then made required)
ALTER TABLE "PurchaseReceiptPayment" ADD COLUMN "accountId" TEXT;
ALTER TABLE "SupplierReturnPayment" ADD COLUMN "accountId" TEXT;

-- Seed a default account so existing payments have somewhere to point
INSERT INTO "FinanceAccount" ("id", "name", "type", "balance", "allowNegativeBalance", "showAtPos", "createdAt", "updatedAt")
VALUES ('acc_default_seif1', 'Сейф - 1', 'CASH', 0, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

UPDATE "PurchaseReceiptPayment" SET "accountId" = 'acc_default_seif1' WHERE "accountId" IS NULL;
UPDATE "SupplierReturnPayment" SET "accountId" = 'acc_default_seif1' WHERE "accountId" IS NULL;

-- Backfill the default account's balance from existing payment history:
-- a receipt payment is cash going OUT, a supplier-return payment is cash coming IN.
UPDATE "FinanceAccount"
SET "balance" = COALESCE((SELECT -SUM("amount") FROM "PurchaseReceiptPayment"), 0)
              + COALESCE((SELECT SUM("amount") FROM "SupplierReturnPayment"), 0)
WHERE "id" = 'acc_default_seif1';

ALTER TABLE "PurchaseReceiptPayment" ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "SupplierReturnPayment" ALTER COLUMN "accountId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptPayment" ADD CONSTRAINT "PurchaseReceiptPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierReturnPayment" ADD CONSTRAINT "SupplierReturnPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_expenseTypeId_fkey" FOREIGN KEY ("expenseTypeId") REFERENCES "ExpenseType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed expense types (Дивиденды is a built-in, always-active, non-manageable type — matches real UMAG)
INSERT INTO "ExpenseType" ("id", "name", "active", "manageable", "sortOrder") VALUES
  ('exp_dividends', 'Дивиденды', true, false, 0),
  ('exp_other', 'Другое', true, true, 1),
  ('exp_petty', 'Закуп мелочей', true, true, 2),
  ('exp_salary', 'Заработная плата', true, true, 3),
  ('exp_utilities', 'Коммунальные расходы', true, true, 4),
  ('exp_cashcollection', 'Инкассация', true, true, 5);
