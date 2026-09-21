-- Speeds up store-scoped consignment receipt filters.
-- The earlier migration adds isConsignment with a false default before this runs.
CREATE INDEX IF NOT EXISTS "PurchaseReceipt_storeId_isConsignment_idx"
ON "PurchaseReceipt"("storeId", "isConsignment");
