CREATE TABLE "UserStoreAssignment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserStoreAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserStoreAssignment_userId_storeId_key" ON "UserStoreAssignment"("userId", "storeId");
CREATE INDEX "UserStoreAssignment_storeId_idx" ON "UserStoreAssignment"("storeId");

ALTER TABLE "UserStoreAssignment" ADD CONSTRAINT "UserStoreAssignment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserStoreAssignment" ADD CONSTRAINT "UserStoreAssignment_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
