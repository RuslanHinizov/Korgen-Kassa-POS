-- This migration is ordered before the migration that creates WriteOffReason.
-- Keep it harmless on a clean installation; the rename itself runs later.
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
