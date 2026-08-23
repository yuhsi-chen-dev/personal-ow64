// 登入。Auth.js v5 + Google，session 走 JWT——沒有 users／accounts／sessions 資料表，
// 身分整包放在使用者瀏覽器的 cookie 裡，用 AUTH_SECRET 簽章。
// 為什麼不是 Neon Auth，見 docs/decisions/0011-multi-tenant.md。
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    // JWT 策略下 session.user.id 預設是空的，要自己從 token.sub 補上。
    // token.sub 是 Google 的 subject——同一個 Google 帳號對這個 app 永遠是同一個值。
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

/**
 * 目前登入者的 id。**沒登入就丟錯，不回傳 null。**
 *
 * 回傳 null 的話，呼叫端會很自然地寫成 `where userId = null` 然後靜默地不做事，
 * 或更糟——忘記處理。資料隔離是這個 app 的鐵則（見 CLAUDE.md 的限制），
 * 讓它在缺使用者時大聲壞掉，比安靜地放行安全。
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("未登入");
  return id;
}
