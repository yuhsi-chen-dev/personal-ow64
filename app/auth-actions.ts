"use server";

import { signIn, signOut } from "@/auth.ts";

export async function signInWithGoogle() {
  // 登入完直接進計劃表清單，不要把人丟回那張已經看完的介紹頁。
  await signIn("google", { redirectTo: "/dashboard" });
}

export async function signOutOfApp() {
  await signOut({ redirectTo: "/" });
}
