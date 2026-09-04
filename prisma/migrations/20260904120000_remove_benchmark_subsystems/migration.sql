-- Removes the benchmark subsystems: arena, leaderboard, voting, the public
-- Gallery, and private evaluations. Tables are dropped children first so no
-- foreign key is left pointing at a table that no longer exists, and the
-- Gallery columns on "User" go with them.

-- Arena coverage bookkeeping
DROP TABLE IF EXISTS "ArenaCoveragePairPrompt" CASCADE;
DROP TABLE IF EXISTS "ArenaCoveragePair" CASCADE;
DROP TABLE IF EXISTS "ArenaCoverageModelPrompt" CASCADE;

-- Arena job queues
DROP TABLE IF EXISTS "ArenaShownJob" CASCADE;
DROP TABLE IF EXISTS "ArenaVoteJob" CASCADE;

-- Voting and matchmaking
DROP TABLE IF EXISTS "Vote" CASCADE;
DROP TABLE IF EXISTS "Matchup" CASCADE;
DROP TABLE IF EXISTS "ArenaBuildArtifact" CASCADE;

-- Gallery
DROP TABLE IF EXISTS "GalleryModerationRecord" CASCADE;
DROP TABLE IF EXISTS "GalleryVoteBlock" CASCADE;
DROP TABLE IF EXISTS "GalleryVote" CASCADE;
DROP TABLE IF EXISTS "GalleryExample" CASCADE;
DROP TABLE IF EXISTS "GalleryCandidate" CASCADE;

-- Private evaluations
DROP TABLE IF EXISTS "StealthGenerationResult" CASCADE;
DROP TABLE IF EXISTS "StealthGenerationRun" CASCADE;
DROP TABLE IF EXISTS "StealthEndpointCredential" CASCADE;
DROP TABLE IF EXISTS "StealthVariant" CASCADE;
DROP TABLE IF EXISTS "StealthCohortUpload" CASCADE;
DROP TABLE IF EXISTS "StealthExperiment" CASCADE;

-- Organizations existed only to scope private evaluations
DROP TABLE IF EXISTS "OrganizationInvitation" CASCADE;
DROP TABLE IF EXISTS "OrganizationMembership" CASCADE;
DROP TABLE IF EXISTS "Organization" CASCADE;

-- Benchmark builds, prompts and models
DROP TABLE IF EXISTS "Build" CASCADE;
DROP TABLE IF EXISTS "ModelRankSnapshot" CASCADE;
DROP TABLE IF EXISTS "Model" CASCADE;
DROP TABLE IF EXISTS "Prompt" CASCADE;

-- Enums that only those tables used
DROP TYPE IF EXISTS "GalleryReportReason";
DROP TYPE IF EXISTS "GalleryModerationTarget";
DROP TYPE IF EXISTS "GalleryModerationKind";
DROP TYPE IF EXISTS "StealthGenerationResultStatus";
DROP TYPE IF EXISTS "StealthGenerationRunStatus";
DROP TYPE IF EXISTS "StealthVariantSource";
DROP TYPE IF EXISTS "StealthVariantStatus";
DROP TYPE IF EXISTS "StealthExperimentStatus";
DROP TYPE IF EXISTS "StealthExportPolicy";
DROP TYPE IF EXISTS "OrganizationRole";

-- Gallery moderation state on the account
DROP INDEX IF EXISTS "User_gallerySuspendedById_idx";
ALTER TABLE "User" DROP COLUMN IF EXISTS "gallerySuspendedAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "gallerySuspensionReason";
ALTER TABLE "User" DROP COLUMN IF EXISTS "gallerySuspendedById";
ALTER TABLE "User" DROP COLUMN IF EXISTS "galleryRestoredAt";
