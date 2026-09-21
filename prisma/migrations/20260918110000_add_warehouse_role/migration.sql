-- Allows store-assigned warehouse employees to prepare goods-receipt drafts.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'WAREHOUSE';
