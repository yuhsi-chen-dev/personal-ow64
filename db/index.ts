import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.ts";

let cached: ReturnType<typeof drizzle<typeof schema>> | undefined;

/**
 * 連線延後到第一次查詢才建立，這樣 build 與型別檢查不需要 DATABASE_URL。
 * 沒設定時直接丟錯，不要靜默 fallback 到別的資料庫。
 * 見 docs/decisions/0005-deploy-vercel-neon.md。
 */
export function getDb() {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL 未設定，見 docs/decisions/0005-deploy-vercel-neon.md");
    cached = drizzle(neon(url), { schema });
  }
  return cached;
}
