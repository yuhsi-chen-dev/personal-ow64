"use server";

import { signIn, signOut } from "@/auth.ts";

export async function signInWithGoogle() {
  await signIn("google");
}

export async function signOutOfApp() {
  await signOut({ redirectTo: "/" });
}
