-- A single one-time setup code can belong to only one register.
CREATE UNIQUE INDEX "Cashbox_oneTimeKey_key" ON "Cashbox"("oneTimeKey");
