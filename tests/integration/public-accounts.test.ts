import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { claimAnonymousSession, syncAuthUser } from "../../lib/auth/account";

const db = new PrismaClient();

async function main() {
  if (!process.env.MINEBENCH_TEST_SCHEMA) {
    console.log("public account PostgreSQL checks require pnpm test:integration");
    return;
  }

  const suffix = randomUUID().replaceAll("-", "");
  const sessionId = `public-account-${suffix}`;
  const userId = randomUUID();

  try {
    const user = await db.user.create({
      data: {
        id: userId,
        email: `account-${suffix}@example.test`,
        isMineBenchAdmin: true,
      },
    });

    const authUser: SupabaseAuthUser = {
      id: user.id,
      email: user.email,
      app_metadata: { provider: "google", providers: ["google"] },
      user_metadata: { full_name: "Account Admin" },
      aud: "authenticated",
      created_at: new Date().toISOString(),
    };

    // Signing in syncs the profile without clearing the admin flag.
    const syncedUser = await syncAuthUser(authUser);
    assert.equal(syncedUser?.id, user.id);
    assert.equal(syncedUser?.isMineBenchAdmin, true);
    assert.equal(syncedUser?.displayName, "Account Admin");

    // An anonymous browser session becomes the account's on sign in, so
    // presence does not count one person twice.
    await db.publicSessionActivity.create({
      data: { sessionId, lastSeenAt: new Date(), city: "Vaasa", country: "FI" },
    });
    await claimAnonymousSession(user.id, sessionId);
    const claimed = await db.publicSessionActivity.findUnique({ where: { sessionId } });
    assert.equal(claimed?.userId, user.id);

    // Claiming with no session is a no-op rather than an error.
    await claimAnonymousSession(user.id, null);

    console.log("public account checks passed");
  } finally {
    await db.publicSessionActivity.deleteMany({ where: { sessionId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
