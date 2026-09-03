import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PUBLIC_SESSION_COOKIE,
  PUBLIC_SESSION_COOKIE_OPTIONS,
} from "@/lib/publicSession";
import { hasSupabaseAuthCookie } from "@/lib/auth/cookies";

export { hasSupabaseAuthCookie } from "@/lib/auth/cookies";

export type PublicAccount = {
  id: string;
  email: string;
  displayName: string | null;
  publicNickname: string | null;
  isMineBenchAdmin: boolean;
  hostedGenerationCount: number;
  hostedGenerationLimit: number;
  createdAt: Date;
};

type AccountSecurity = {
  account: PublicAccount;
  isPasswordRecovery: boolean;
  signedInWithPassword: boolean;
};

const publicAccountSelect = {
  id: true,
  email: true,
  displayName: true,
  publicNickname: true,
  isMineBenchAdmin: true,
  hostedGenerationCount: true,
  hostedGenerationLimit: true,
  createdAt: true,
} as const;

function authDisplayName(authUser: SupabaseAuthUser): string | null {
  for (const key of ["name", "full_name", "preferred_username", "user_name"]) {
    const value = authUser.user_metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 120);
  }
  return null;
}

export function hasAuthenticationMethod(amr: unknown, method: string): boolean {
  return Array.isArray(amr) && amr.some((entry) => {
    if (typeof entry === "string") return entry === method;
    if (!entry || typeof entry !== "object") return false;
    return "method" in entry && entry.method === method;
  });
}

export function isPasswordRecoveryMethod(amr: unknown): boolean {
  return hasAuthenticationMethod(amr, "recovery") || hasAuthenticationMethod(amr, "otp");
}

export async function syncAuthUser(authUser: SupabaseAuthUser): Promise<PublicAccount | null> {
  const email = authUser.email?.trim().toLowerCase();
  if (!email) return null;
  const displayName = authDisplayName(authUser);
  const now = new Date();
  const [account] = await prisma.$queryRaw<PublicAccount[]>(Prisma.sql`
    INSERT INTO "User" (id, email, "displayName", "lastSeenAt", "createdAt", "updatedAt")
    VALUES (${authUser.id}::uuid, ${email}, ${displayName}, ${now}, ${now}, ${now})
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        "displayName" = COALESCE(EXCLUDED."displayName", "User"."displayName"),
        "lastSeenAt" = EXCLUDED."lastSeenAt",
        "updatedAt" = EXCLUDED."updatedAt"
    WHERE "User"."deletedAt" IS NULL
    RETURNING
      id,
      email,
      "displayName",
      "publicNickname",
      "isMineBenchAdmin",
      "hostedGenerationCount",
      "hostedGenerationLimit",
      "createdAt"
  `);
  return account ?? null;
}

export async function getPublicAccount(userId: string): Promise<PublicAccount | null> {
  return prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: publicAccountSelect,
  });
}

export async function getCurrentAccount(): Promise<PublicAccount | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return syncAuthUser(user);
}

export async function getCurrentAccountSecurity(): Promise<AccountSecurity | null> {
  const supabase = await createSupabaseServerClient();
  const [userResult, claimsResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getClaims(),
  ]);
  const user = userResult.data.user;
  if (userResult.error || !user) return null;
  const account = await syncAuthUser(user);
  if (!account) return null;
  const amr = claimsResult.error ? null : claimsResult.data?.claims.amr;
  return {
    account,
    isPasswordRecovery: isPasswordRecoveryMethod(amr),
    signedInWithPassword: hasAuthenticationMethod(amr, "password"),
  };
}

// An anonymous browser session becomes the account's once they sign in, so
// presence carries over instead of showing two people.
export async function claimAnonymousSession(
  userId: string,
  sessionId: string | null,
): Promise<void> {
  if (!sessionId) return;
  await prisma.publicSessionActivity.updateMany({
    where: { sessionId },
    data: { userId },
  });
}

async function clearLocalAuthSession(): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch {}
}

export async function finishPublicSignIn(
  authUser: SupabaseAuthUser,
): Promise<{ account: PublicAccount } | null> {
  try {
    const account = await syncAuthUser(authUser);
    if (!account) {
      await clearLocalAuthSession();
      return null;
    }

    const cookieStore = await cookies();
    await claimAnonymousSession(
      account.id,
      cookieStore.get(PUBLIC_SESSION_COOKIE)?.value ?? null,
    );
    cookieStore.set(PUBLIC_SESSION_COOKIE, crypto.randomUUID(), PUBLIC_SESSION_COOKIE_OPTIONS);
    return { account };
  } catch (error) {
    await clearLocalAuthSession();
    throw error;
  }
}

export async function rotatePublicSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(PUBLIC_SESSION_COOKIE, crypto.randomUUID(), PUBLIC_SESSION_COOKIE_OPTIONS);
}
