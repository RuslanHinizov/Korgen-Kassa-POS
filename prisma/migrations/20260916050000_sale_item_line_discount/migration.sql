-- Кассa: per-line СКИДКА on a sale item (UMAG-style row discount).
ALTER TABLE "SaleItem" ADD COLUMN "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
