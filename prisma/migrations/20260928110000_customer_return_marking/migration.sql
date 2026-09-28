-- A return can contain a DataMatrix code captured from the individual physical item.
ALTER TABLE "CustomerReturnItem" ADD COLUMN "markingCode" TEXT;
