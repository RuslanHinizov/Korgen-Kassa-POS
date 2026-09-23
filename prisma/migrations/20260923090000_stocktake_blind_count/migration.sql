-- Blind count: newly added stocktake items start uncounted (null), never
-- pre-filled with the system's own expected quantity. Existing rows keep
-- their current (already-counted) values unchanged.
ALTER TABLE "StocktakeItem" ALTER COLUMN "countedQty" DROP NOT NULL;
ALTER TABLE "StocktakeItem" ALTER COLUMN "difference" DROP NOT NULL;
