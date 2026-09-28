-- Marks a row as pushed to the cloud by a local Hub's sync worker. Always NULL on the cloud database itself —
-- these columns only mean something on a Hub's own local copy. See docs/kasa-offline-plan.md §9b.2.
ALTER TABLE "Sale" ADD COLUMN "syncedToCloudAt" TIMESTAMP(3);
ALTER TABLE "Shift" ADD COLUMN "syncedToCloudAt" TIMESTAMP(3);
ALTER TABLE "CashMovement" ADD COLUMN "syncedToCloudAt" TIMESTAMP(3);
ALTER TABLE "Refund" ADD COLUMN "syncedToCloudAt" TIMESTAMP(3);
ALTER TABLE "CustomerReturn" ADD COLUMN "syncedToCloudAt" TIMESTAMP(3);
