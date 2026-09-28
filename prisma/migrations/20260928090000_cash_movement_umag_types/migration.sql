-- CashMovement.type now matches UMAG's own 3 types exactly (Вложения/Расходы/Дивиденды — see
-- docs/kasa-offline-plan.md §6): IN -> DEPOSIT, OUT/PAYOUT/DROP -> EXPENSE (they already shared one
-- "cash out" bucket in every report, see src/lib/shift.ts). DIVIDEND is new, chosen by a cashier going
-- forward; no existing row maps to it.
CREATE TYPE "CashMovementType_new" AS ENUM ('DEPOSIT', 'EXPENSE', 'DIVIDEND');

ALTER TABLE "CashMovement" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "CashMovement" ALTER COLUMN "type" TYPE "CashMovementType_new" USING (
  CASE "type"::text
    WHEN 'IN' THEN 'DEPOSIT'
    ELSE 'EXPENSE'
  END
)::"CashMovementType_new";

DROP TYPE "CashMovementType";
ALTER TYPE "CashMovementType_new" RENAME TO "CashMovementType";
