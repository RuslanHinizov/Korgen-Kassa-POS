-- Track when a stocktake line was actually counted, matching UMAG's real
-- "Время сканирования" column. Existing (already-counted) rows get null —
-- they predate this column and their exact count time was never recorded.
ALTER TABLE "StocktakeItem" ADD COLUMN "scannedAt" TIMESTAMP(3);
