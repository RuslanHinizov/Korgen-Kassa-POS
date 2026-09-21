ALTER TABLE "Product" ADD COLUMN "scalePlu" TEXT;

CREATE UNIQUE INDEX "Product_scalePlu_key" ON "Product"("scalePlu");
