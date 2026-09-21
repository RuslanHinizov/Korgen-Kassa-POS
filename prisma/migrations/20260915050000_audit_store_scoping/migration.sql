-- Phase 6: scope AuditLog and CancelledItem to a specific Store. Existing
-- data all belongs to the one real store seeded as 'store_main'. LoyaltyLog
-- needs no schema change — it is already scoped indirectly via its required
-- customerId -> Customer.storeId relation (Customer was scoped in Phase 3b).
-- ProductCharacteristic / ProductCharacteristicValue stay global by design
-- (shared label vocabulary, no business-sensitive data).

ALTER TABLE "AuditLog" ADD COLUMN "storeId" TEXT;
UPDATE "AuditLog" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "AuditLog_storeId_idx" ON "AuditLog"("storeId");

ALTER TABLE "CancelledItem" ADD COLUMN "storeId" TEXT;
UPDATE "CancelledItem" SET "storeId" = 'store_main' WHERE "storeId" IS NULL;
ALTER TABLE "CancelledItem" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "CancelledItem" ADD CONSTRAINT "CancelledItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "CancelledItem_storeId_idx" ON "CancelledItem"("storeId");
