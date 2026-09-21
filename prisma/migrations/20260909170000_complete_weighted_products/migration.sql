-- Complete support for goods sold by weight. Existing whole-number stock remains intact.
ALTER TABLE "Product" ALTER COLUMN "stock" SET DATA TYPE DECIMAL(10,3);
ALTER TABLE "SaleItem" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'pcs';
ALTER TABLE "StockAdjustment" ALTER COLUMN "delta" SET DATA TYPE DECIMAL(10,3);
