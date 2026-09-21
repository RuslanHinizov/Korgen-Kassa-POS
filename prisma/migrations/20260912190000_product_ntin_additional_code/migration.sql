-- Список товаров: "Код НКТ (NTIN)" and "Доп. код" columns from real UMAG.
ALTER TABLE "Product" ADD COLUMN "ntin" TEXT;
ALTER TABLE "Product" ADD COLUMN "additionalCode" TEXT;
