-- A till program's activation code and device key can be tied to one register (Cashbox), so its sales, cash in/out and
-- refunds land on that register's accounts. A cash in/out remembers which register account it moved.
ALTER TABLE "ActivationCode" ADD COLUMN "cashboxId" TEXT;
ALTER TABLE "HubToken" ADD COLUMN "cashboxId" TEXT;
ALTER TABLE "CashMovement" ADD COLUMN "accountId" TEXT;
