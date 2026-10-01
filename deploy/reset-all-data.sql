-- Wipes EVERY market and ALL business data from the database. Kept: the platform owner account(s) (role SUPERADMIN) and
-- the migration history. Document numbers (check numbers, receipts, ...) start again from 1.
-- Run only through deploy/reset-all-data.sh (it takes a backup first and asks for confirmation).
BEGIN;
-- delete in any order: foreign keys are not checked inside this transaction
SET LOCAL session_replication_role = replica;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'User', 'Account')
  LOOP
    EXECUTE format('DELETE FROM %I', t);
  END LOOP;
END $$;

-- everyone except the platform owner goes; so do their sign-in records (all sessions were deleted above)
DELETE FROM "Account" WHERE "userId" IN (SELECT id FROM "User" WHERE role <> 'SUPERADMIN');
DELETE FROM "User" WHERE role <> 'SUPERADMIN';

-- numbering starts from 1 again
DO $$
DECLARE s record;
BEGIN
  FOR s IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public' LOOP
    EXECUTE format('ALTER SEQUENCE %I RESTART WITH 1', s.sequence_name);
  END LOOP;
END $$;

COMMIT;
