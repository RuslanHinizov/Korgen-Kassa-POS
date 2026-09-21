-- AlterTable: products can be sold per piece ("pcs") or by weight ("kg", price is per kg)
ALTER TABLE "Product" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'pcs';

-- AlterTable: allow fractional quantities (kilograms) on sale lines.
-- Integer -> Decimal(10,3) is a lossless widening cast.
ALTER TABLE "SaleItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(10,3);
