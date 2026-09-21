-- CreateTable
CREATE TABLE "QuickProductGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickProductGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickProduct" (
    "id" TEXT NOT NULL,
    "groupId" TEXT,
    "productId" TEXT NOT NULL,
    "displayName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuickProductGroup_name_key" ON "QuickProductGroup"("name");

-- CreateIndex
CREATE INDEX "QuickProduct_groupId_idx" ON "QuickProduct"("groupId");

-- CreateIndex
CREATE INDEX "QuickProduct_productId_idx" ON "QuickProduct"("productId");

-- AddForeignKey
ALTER TABLE "QuickProduct" ADD CONSTRAINT "QuickProduct_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "QuickProductGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickProduct" ADD CONSTRAINT "QuickProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
