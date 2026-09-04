import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { PublicAccount } from "@/lib/auth/account";
import { redactSensitiveText } from "@/lib/custom-builds/sanitize";
import { prisma } from "@/lib/prisma";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const DEFAULT_AUTH_DELETION_BATCH_SIZE = 100;

export class AccountServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AccountServiceError";
  }
}

export function serializeAccount(account: PublicAccount) {
  const remaining = Math.max(0, account.hostedGenerationLimit - account.hostedGenerationCount);
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    publicNickname: account.publicNickname,
    createdAt: account.createdAt.toISOString(),
    hostedGeneration: {
      used: account.hostedGenerationCount,
      limit: account.hostedGenerationLimit,
      remaining,
      available: remaining > 0 && Boolean(process.env.MINEBENCH_FREE_OPENROUTER_API_KEY?.trim()),
    },
  };
}

async function deleteSupabaseAuthUser(userId: string): Promise<void> {
  const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(userId);
  if (error) throw error;
}

async function markAuthDeleted(userId: string, now: Date): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, deletedAt: { not: null }, authDeletedAt: null },
    data: { authDeletedAt: now },
  });
}

export async function deleteMineBenchAccount(
  userId: string,
  options: {
    now?: Date;
    deleteAuthUser?: (userId: string) => Promise<void>;
  } = {},
) {
  const now = options.now ?? new Date();
  await prisma.$transaction(async (tx) => {
    const [account] = await tx.$queryRaw<Array<{ id: string; email: string }>>(Prisma.sql`
      SELECT id, email
      FROM "User"
      WHERE id = ${userId}::uuid
        AND "deletedAt" IS NULL
      FOR UPDATE
    `);
    if (!account) throw new AccountServiceError("not_found", "Account not found.");

    const ownedBuildWhere = { ownerId: userId };

    await tx.customBuildSecret.deleteMany({ where: { customBuild: { ownerId: userId } } });
    await tx.customBuildJob.updateMany({
      where: {
        customBuild: ownedBuildWhere,
        status: { in: ["queued", "running"] },
      },
      data: {
        status: "canceled",
        completedAt: now,
        lockedBy: null,
        lockedAt: null,
        leaseExpiresAt: null,
      },
    });
    await tx.customBuild.updateMany({
      where: {
        ...ownedBuildWhere,
        status: { in: ["queued", "running"] },
      },
      data: {
        status: "canceled",
        currentStage: "canceled",
        completedAt: now,
        errorCode: "account_deleted",
        errorMessage: "Account deleted.",
        errorRetryable: false,
      },
    });
    await tx.customBuild.updateMany({
      where: ownedBuildWhere,
      data: {
        requestedIpHash: null,
        requestedUserAgentHash: null,
        removedAt: now,
        purgeAt: now,
        objectsDeletedAt: null,
        deletionPendingAt: now,
        deletionError: null,
      },
    });

    await tx.$executeRaw(Prisma.sql`
      UPDATE "PublicSessionActivity"
      SET "userId" = NULL,
          "sessionId" = gen_random_uuid()::text,
          city = NULL,
          "countryRegion" = NULL,
          country = NULL,
          "ipHmac" = NULL
      WHERE "userId" = ${userId}::uuid
    `);

    await tx.user.update({
      where: { id: userId },
      data: {
        email: `${randomUUID()}@deleted.minebench.invalid`,
        displayName: null,
        publicNickname: null,
        publicNicknameNormalized: null,
        lastSeenAt: null,
        isMineBenchAdmin: false,
        totalGenerationCount: 0,
        hostedGenerationCount: 0,
        hostedGenerationLimit: 0,
        deletedAt: now,
        authDeletedAt: null,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  try {
    await (options.deleteAuthUser ?? deleteSupabaseAuthUser)(userId);
    await markAuthDeleted(userId, now);
  } catch (error) {
    console.error("Supabase Auth account deletion pending", redactSensitiveText(error));
  }
  return { deleted: true } as const;
}

export async function retryPendingAuthDeletions(
  options: {
    now?: Date;
    limit?: number;
    deleteAuthUser?: (userId: string) => Promise<void>;
  } = {},
) {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_AUTH_DELETION_BATCH_SIZE, 500));
  const pending = await prisma.user.findMany({
    where: { deletedAt: { not: null }, authDeletedAt: null },
    orderBy: [{ deletedAt: "asc" }, { id: "asc" }],
    take: limit,
    select: { id: true },
  });
  let deleted = 0;
  let failures = 0;
  for (const account of pending) {
    try {
      await (options.deleteAuthUser ?? deleteSupabaseAuthUser)(account.id);
      await markAuthDeleted(account.id, now);
      deleted += 1;
    } catch (error) {
      failures += 1;
      console.error("Supabase Auth account deletion retry failed", redactSensitiveText(error));
    }
  }
  return { deleted, failures };
}
