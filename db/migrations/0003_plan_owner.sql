-- 直接 ADD COLUMN ... NOT NULL 會在有資料的表上失敗，所以拆三步：
-- 先加可空欄位、把既有的列指給一個不屬於任何人的哨兵值、再收成 NOT NULL。
-- 哨兵值 '__unclaimed__' 對不上任何 OAuth subject，所以那些列對所有人都是隱形的，
-- 但資料還在——要認領或刪除都還來得及。見 docs/decisions/0011-multi-tenant.md。
ALTER TABLE "plans" ADD COLUMN "user_id" text;--> statement-breakpoint
UPDATE "plans" SET "user_id" = '__unclaimed__' WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "user_id" SET NOT NULL;
