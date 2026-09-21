-- Rounding is opt-in: default to no rounding for weighted items and discounts.
ALTER TABLE "BusinessSettings" ALTER COLUMN "posRoundingWeightItems" SET DEFAULT 'NONE';
ALTER TABLE "BusinessSettings" ALTER COLUMN "posRoundingDiscount" SET DEFAULT 'NONE';
UPDATE "BusinessSettings" SET "posRoundingWeightItems" = 'NONE', "posRoundingDiscount" = 'NONE';
