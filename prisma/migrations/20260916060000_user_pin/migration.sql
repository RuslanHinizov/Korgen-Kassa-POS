-- Кассa: per-user PIN for the "who's working" kiosk quick-switch.
ALTER TABLE "User" ADD COLUMN "pin" TEXT;
