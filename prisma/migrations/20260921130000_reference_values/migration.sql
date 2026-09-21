-- Values picked from Справочники at the kassa (sales and returns).
ALTER TABLE "Sale" ADD COLUMN "referenceValues" JSONB;
ALTER TABLE "Refund" ADD COLUMN "referenceValues" JSONB;
ALTER TABLE "CustomerReturn" ADD COLUMN "referenceValues" JSONB;
