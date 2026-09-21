-- Управление → Справочник: user-defined named value lists.
CREATE TABLE "ReferenceBook" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modules" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferenceBook_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferenceBookEntry" (
    "id" TEXT NOT NULL,
    "referenceBookId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferenceBookEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReferenceBook_storeId_idx" ON "ReferenceBook"("storeId");
CREATE INDEX "ReferenceBookEntry_referenceBookId_idx" ON "ReferenceBookEntry"("referenceBookId");

ALTER TABLE "ReferenceBook" ADD CONSTRAINT "ReferenceBook_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferenceBookEntry" ADD CONSTRAINT "ReferenceBookEntry_referenceBookId_fkey" FOREIGN KEY ("referenceBookId") REFERENCES "ReferenceBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
