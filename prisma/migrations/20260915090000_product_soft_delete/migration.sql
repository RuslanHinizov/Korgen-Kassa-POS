-- Faz D: Product soft delete (deleteProduct() now sets deletedAt instead of a
-- hard DELETE, which also fixes it failing today on any product with sale/
-- receipt/stocktake/etc. history — those relations are onDelete: Restrict).
ALTER TABLE "Product" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Faz C item 10: Excel/collector import restores a soft-deleted product on
-- barcode/SKU match instead of erroring, when this setting is on.
ALTER TABLE "BusinessSettings" ADD COLUMN "autoRestoreDeletedProducts" BOOLEAN NOT NULL DEFAULT false;
