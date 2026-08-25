// 登入。Auth.js v5 + Google，session 走 JWT——沒有 users／accounts／sessions 資料表，
// 身分整包放在使用者瀏覽器的 cookie 裡，用 AUTH_SECRET 簽章。
// 為什麼不是 Neon Auth，見 docs/decisions/0011-multi-tenant.md。
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    // token.sub 預設**不是**穩定身分：OAuth 流程給的 user.id 是每次登入現生的
    // crypto.randomUUID()（@auth/core 的 getUserAndAccount，它刻意讓 user 不綁 provider，
    // 因為正常情況下 Google 的 sub 會被 adapter 存進 accounts 表）。我們沒有 adapter，
    // 那份對應關係無處可存，於是同一個人每次登入都會變成新的人、看不到自己的計劃表。
    // 所以在登入當下（只有這一次 account 有值）把 token.sub 換成 Google 的 sub。
    // Google 的 sub 對一個 Google 帳號永久唯一且不重用，跨 OAuth client 也一樣。
    jwt({ token, account }) {
      if (account?.providerAccountId) token.sub = account.providerAccountId;
      return token;
    },
    // JWT 策略下 session.user.id 預設是空的，要自己從 token.sub 補上。
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
