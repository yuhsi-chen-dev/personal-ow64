import { auth } from "@/auth.ts";
import { Landing } from "./landing.tsx";

// 登入狀態決定按鈕是「登入」還是「進入我的計劃表」，所以不能在 build 時預渲染。
export const dynamic = "force-dynamic";

/**
 * `/` 永遠是那張公開的入口頁，登入與否都一樣。
 *
 * 不在這裡把登入的人轉去 `/dashboard`：一個網址就該是一份內容，
 * 「同一個網址對不同人長得不一樣」是把介紹頁跟應用程式擠在一起才有的問題，
 * 而那正是搬去 `/dashboard` 要解掉的。已登入的人看到的差別只有按鈕上的字。
 */
export default async function Home() {
  const signedIn = Boolean((await auth())?.user?.id);
  return <Landing signedIn={signedIn} />;
}
