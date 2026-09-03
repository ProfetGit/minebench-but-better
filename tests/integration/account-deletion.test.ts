import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import {
  deleteMineBenchAccount,
  retryPendingAuthDeletions,
} from "../../lib/account/service";
import { getPublicAccount, syncAuthUser } from "../../lib/auth/account";

const db = new PrismaClient();

async function main() {
  if (!process.env.MINEBENCH_TEST_SCHEMA) {
    console.log("account deletion checks require pnpm test:integration");
    return;
  }

  const suffix = randomUUID().replaceAll("-", "");
  let activityId: string | null = null;
  const userId = randomUUID();
  const pendingUserId = randomUUID();
  const now = new Date("2026-08-29T15:00:00.000Z");
  const succeededBuildId = `account-delete-succeeded-${suffix}`;
  const runningBuildId = `account-delete-running-${suffix}`;
  const activitySession = `account-delete-activity-${suffix}`;

  const customBuildData = (id: string, status: "succeeded" | "running") => ({
    id,
    publicId: `cb_${id}`,
    ownerId: userId,
    status,
    currentStage: status,
    promptText: `Account deletion fixture ${id}`,
    promptSha256: id.padEnd(64, "a").slice(0, 64),
    gridSize: 64,
    palette: "simple",
    modelKind: "catalog",
    modelProvider: "openai",
    modelId: "gpt-5.4-mini",
    modelDisplayName: "GPT 5.4 Mini",
    requestedIpHash: "request-ip-hash",
    requestedUserAgentHash: "request-agent-hash",
  });

  try {
    await db.user.createMany({
      data: [
        {
          id: userId,
          email: `delete-${suffix}@example.test`,
          displayName: "Delete Me",
          publicNickname: `Builder ${suffix.slice(0, 6)}`,
          publicNicknameNormalized: `builder ${suffix.slice(0, 6)}`,
          lastSeenAt: now,
          isMineBenchAdmin: true,
          totalGenerationCount: 12,
          hostedGenerationCount: 5,
          hostedGenerationLimit: 20,
        },
        {
          id: pendingUserId,
          email: `pending-${suffix}@example.test`,
          deletedAt: now,
        },
      ],
    });

    await db.customBuild.createMany({
      data: [customBuildData(succeededBuildId, "succeeded"), customBuildData(runningBuildId, "running")],
    });
    await db.customBuildArtifact.create({
      data: {
        customBuildId: succeededBuildId,
        kind: "build_json",
        format: "json",
        bucket: "builds",
        path: `${succeededBuildId}/build.json.gz`,
        encoding: "gzip",
        contentType: "application/json",
        fileName: "build.json",
        sha256: "sha256",
        byteSize: 20,
        storedByteSize: 10,
      },
    });
    await db.customBuildJob.create({
      data: { customBuildId: runningBuildId, type: "generate", status: "queued" },
    });
    await db.customBuildSecret.create({
      data: {
        customBuildId: runningBuildId,
        provider: "openai",
        keyCiphertext: "cipher",
        keyIv: "iv",
        expiresAt: new Date("2026-09-30T00:00:00.000Z"),
      },
    });
    const activity = await db.publicSessionActivity.create({
      data: {
        sessionId: activitySession,
        userId,
        lastSeenAt: now,
        city: "Vaasa",
        countryRegion: "Ostrobothnia",
        country: "FI",
        ipHmac: "ip-hmac",
      },
    });

    activityId = activity.id;

    const deletedAuthUsers: string[] = [];
    assert.deepEqual(
      await deleteMineBenchAccount(userId, {
        now,
        deleteAuthUser: async (id) => {
          deletedAuthUsers.push(id);
        },
      }),
      { deleted: true },
    );
    assert.deepEqual(deletedAuthUsers, [userId]);

    // The row is kept as a tombstone so foreign keys hold, with nothing
    // personal left on it.
    const tombstone = await db.user.findUniqueOrThrow({ where: { id: userId } });
    assert.match(tombstone.email, /^[0-9a-f-]+@deleted\.minebench\.invalid$/);
    assert.equal(tombstone.displayName, null);
    assert.equal(tombstone.publicNickname, null);
    assert.equal(tombstone.publicNicknameNormalized, null);
    assert.equal(tombstone.lastSeenAt, null);
    assert.equal(tombstone.isMineBenchAdmin, false);
    assert.equal(tombstone.totalGenerationCount, 0);
    assert.equal(tombstone.hostedGenerationCount, 0);
    assert.equal(tombstone.hostedGenerationLimit, 0);
    assert.equal(tombstone.deletedAt?.getTime(), now.getTime());
    assert.equal(tombstone.authDeletedAt?.getTime(), now.getTime());
    assert.equal(await getPublicAccount(userId), null);

    // A deleted account cannot be resurrected by signing in again.
    const authUser: SupabaseAuthUser = {
      id: userId,
      email: `delete-${suffix}@example.test`,
      app_metadata: { provider: "google", providers: ["google"] },
      user_metadata: {},
      aud: "authenticated",
      created_at: now.toISOString(),
    };
    assert.equal(await syncAuthUser(authUser), null);
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: userId } })).email,
      tombstone.email,
    );

    // Builds are marked for removal, request fingerprints are cleared, and
    // in-flight work is cancelled.
    const succeeded = await db.customBuild.findUniqueOrThrow({
      where: { id: succeededBuildId },
    });
    assert.equal(succeeded.requestedIpHash, null);
    assert.equal(succeeded.requestedUserAgentHash, null);
    assert.equal(succeeded.removedAt?.getTime(), now.getTime());
    assert.equal(succeeded.purgeAt?.getTime(), now.getTime());
    assert.equal(succeeded.deletionPendingAt?.getTime(), now.getTime());

    const running = await db.customBuild.findUniqueOrThrow({ where: { id: runningBuildId } });
    assert.equal(running.status, "canceled");
    assert.equal(running.errorCode, "account_deleted");
    assert.equal(
      (await db.customBuildJob.findFirstOrThrow({ where: { customBuildId: runningBuildId } }))
        .status,
      "canceled",
    );
    assert.equal(
      await db.customBuildSecret.count({ where: { customBuildId: runningBuildId } }),
      0,
    );

    // Presence rows are cut loose from the account, given a fresh session id,
    // and stripped of location.
    const anonymisedActivity = await db.publicSessionActivity.findUniqueOrThrow({
      where: { id: activity.id },
    });
    assert.equal(anonymisedActivity.userId, null);
    assert.notEqual(anonymisedActivity.sessionId, activitySession);
    assert.equal(anonymisedActivity.city, null);
    assert.equal(anonymisedActivity.country, null);
    assert.equal(anonymisedActivity.ipHmac, null);

    // A deletion whose auth call failed earlier is retried later.
    const retried: string[] = [];
    const result = await retryPendingAuthDeletions({
      now,
      deleteAuthUser: async (id) => {
        retried.push(id);
      },
    });
    assert.ok(result.deleted >= 1);
    assert.ok(retried.includes(pendingUserId));
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: pendingUserId } })).authDeletedAt?.getTime(),
      now.getTime(),
    );

    console.log("account deletion checks passed");
  } finally {
    if (activityId) {
      await db.publicSessionActivity.deleteMany({ where: { id: activityId } });
    }
    await db.customBuildArtifact.deleteMany({
      where: { customBuildId: { in: [succeededBuildId, runningBuildId] } },
    });
    await db.customBuildJob.deleteMany({
      where: { customBuildId: { in: [succeededBuildId, runningBuildId] } },
    });
    await db.customBuildSecret.deleteMany({
      where: { customBuildId: { in: [succeededBuildId, runningBuildId] } },
    });
    await db.customBuild.deleteMany({
      where: { id: { in: [succeededBuildId, runningBuildId] } },
    });
    await db.user.deleteMany({ where: { id: { in: [userId, pendingUserId] } } });
    await db.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
