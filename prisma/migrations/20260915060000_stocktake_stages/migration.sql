-- Faz A: Инвентаризация becomes a full draft->counting->reviewing->posted
-- document (matching Списание/Оприходование), not a one-shot bulk action.
ALTER TYPE "StocktakeStatus" ADD VALUE 'COUNTING';
ALTER TYPE "StocktakeStatus" ADD VALUE 'REVIEWING';

-- Give Stocktake a human document number, same as every other document type
-- (WriteOff/StockIn/PurchaseReceipt/...).
CREATE SEQUENCE "Stocktake_documentNo_seq";
ALTER TABLE "Stocktake" ADD COLUMN "documentNo" INTEGER NOT NULL DEFAULT nextval('"Stocktake_documentNo_seq"');
ALTER SEQUENCE "Stocktake_documentNo_seq" OWNED BY "Stocktake"."documentNo";
