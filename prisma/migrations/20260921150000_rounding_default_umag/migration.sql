-- Match UMAG's own defaults: weighted items and discounts round "1тг вверх".
ALTER TABLE "BusinessSettings" ALTER COLUMN "posRoundingWeightItems" SET DEFAULT 'UP_1';
ALTER TABLE "BusinessSettings" ALTER COLUMN "posRoundingDiscount" SET DEFAULT 'UP_1';
UPDATE "BusinessSettings" SET "posRoundingWeightItems" = 'UP_1', "posRoundingDiscount" = 'UP_1';
