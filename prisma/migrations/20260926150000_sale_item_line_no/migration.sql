-- Position of a line inside its sale; lets an offline till refer to lines of a sale that is not uploaded yet.
ALTER TABLE "SaleItem" ADD COLUMN "lineNo" INTEGER NOT NULL DEFAULT 0;
