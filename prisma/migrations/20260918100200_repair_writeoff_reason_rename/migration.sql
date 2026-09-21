-- The historical rename was ordered before WriteOffReason was created.
-- Perform it once the enum is guaranteed to exist. The condition keeps this
-- safe for databases where the label was already renamed manually.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WriteOffReason')
     AND EXISTS (
       SELECT 1
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'WriteOffReason' AND e.enumlabel = 'THEFT'
     ) THEN
    ALTER TYPE "WriteOffReason" RENAME VALUE 'THEFT' TO 'KITCHEN';
  END IF;
END $$;
