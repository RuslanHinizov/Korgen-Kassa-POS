-- Артикул: SKU/variant-matrix grouping (e.g. "Размер" x "Цвет" -> N products)

-- Product.sku is no longer unique: variant products generated from the same
-- article intentionally share one code.
DROP INDEX IF EXISTS "Product_sku_key";

ALTER TABLE "Product" ADD COLUMN "articleId" TEXT;

CREATE TABLE "ProductArticle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "categoryId" TEXT,
    "supplierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductArticle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductArticle_code_key" ON "ProductArticle"("code");

CREATE TABLE "ProductCharacteristic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCharacteristic_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductCharacteristic_name_key" ON "ProductCharacteristic"("name");

CREATE TABLE "ProductCharacteristicValue" (
    "id" TEXT NOT NULL,
    "characteristicId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCharacteristicValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductCharacteristicValue_characteristicId_value_key" ON "ProductCharacteristicValue"("characteristicId", "value");

CREATE TABLE "ProductArticleCharacteristic" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "characteristicId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductArticleCharacteristic_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductArticleCharacteristic_articleId_characteristicId_key" ON "ProductArticleCharacteristic"("articleId", "characteristicId");

CREATE TABLE "ProductVariantValue" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,

    CONSTRAINT "ProductVariantValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductVariantValue_productId_valueId_key" ON "ProductVariantValue"("productId", "valueId");

CREATE INDEX "Product_articleId_idx" ON "Product"("articleId");

ALTER TABLE "Product" ADD CONSTRAINT "Product_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "ProductArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductArticle" ADD CONSTRAINT "ProductArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductArticle" ADD CONSTRAINT "ProductArticle_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductCharacteristicValue" ADD CONSTRAINT "ProductCharacteristicValue_characteristicId_fkey" FOREIGN KEY ("characteristicId") REFERENCES "ProductCharacteristic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductArticleCharacteristic" ADD CONSTRAINT "ProductArticleCharacteristic_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "ProductArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductArticleCharacteristic" ADD CONSTRAINT "ProductArticleCharacteristic_characteristicId_fkey" FOREIGN KEY ("characteristicId") REFERENCES "ProductCharacteristic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductVariantValue" ADD CONSTRAINT "ProductVariantValue_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductVariantValue" ADD CONSTRAINT "ProductVariantValue_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "ProductCharacteristicValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
