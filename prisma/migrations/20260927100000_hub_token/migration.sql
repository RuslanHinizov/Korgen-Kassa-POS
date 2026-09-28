-- A local Hub (office computer of a multi-till market) authenticates to the cloud with one of these,
-- scoped to exactly one store. See docs/kasa-offline-plan.md §9b.
CREATE TABLE "HubToken" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "HubToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HubToken_tokenHash_key" ON "HubToken"("tokenHash");
CREATE INDEX "HubToken_storeId_idx" ON "HubToken"("storeId");

ALTER TABLE "HubToken" ADD CONSTRAINT "HubToken_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
