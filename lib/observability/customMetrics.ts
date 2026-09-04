import { metric } from "@vercel/functions";
import { z } from "zod";

import {
  getBlockCountBucket,
  roundMetricMs,
} from "@/lib/observability/metricBuckets";

const durationSchema = z.number().finite().nonnegative().nullable();
const blockCountBucketSchema = z.enum([
  "empty",
  "under-8k",
  "8k-50k",
  "50k-150k",
  "150k-300k",
  "300k-1m",
  "1m-plus",
  "unknown",
]);

const voxelMetricSchema = z
  .object({
    kind: z.literal("voxel"),
    surface: z.enum(["builder", "viewer"]),
    variant: z.enum(["preview", "full"]),
    strategy: z.enum(["local", "worker", "worker-facts", "worker-fallback"]),
    cacheStatus: z.enum(["hit", "miss", "disabled", "not-used", "prewarm-hit"]),
    blockCountBucket: blockCountBucketSchema,
    renderedBlockCountBucket: blockCountBucketSchema,
    animated: z.boolean(),
    queueMs: durationSchema,
    atlasMs: durationSchema,
    payloadMs: durationSchema,
    groupMs: durationSchema,
    meshMs: durationSchema,
    firstRenderMs: durationSchema,
    revealMs: durationSchema,
    totalMs: durationSchema,
  })
  .strict();

export const clientMetricBatchSchema = z
  .object({
    samples: z
      .array(
        z.discriminatedUnion("kind", [voxelMetricSchema]),
      )
      .min(1)
      .max(50),
  })
  .strict();

export type ClientMetricSample = z.infer<
  typeof clientMetricBatchSchema
>["samples"][number];

export type CustomMetricEmitter = (
  name: string,
  value: number,
  tags?: Record<string, string>,
) => void;

function emitMetric(
  emit: CustomMetricEmitter,
  name: string,
  value: number | null,
  tags: Record<string, string>,
): void {
  if (value === null) return;
  emit(name, value, tags);
}

function emitStages(
  emit: CustomMetricEmitter,
  name: string,
  tags: Record<string, string>,
  stages: Record<string, number | null>,
): void {
  for (const [stage, value] of Object.entries(stages)) {
    emitMetric(emit, name, roundMetricMs(value), { ...tags, stage });
  }
}

export function emitClientCustomMetrics(
  samples: readonly ClientMetricSample[],
  emit: CustomMetricEmitter = metric,
) {
  for (const sample of samples) {
    const tags = {
      surface: sample.surface,
      variant: sample.variant,
      strategy: sample.strategy,
      cache: sample.cacheStatus,
      block_bucket: sample.blockCountBucket,
      rendered_bucket: sample.renderedBlockCountBucket,
      animated: String(sample.animated),
    };
    emitStages(emit, "minebench.voxel.stage_ms", tags, {
      queue: sample.queueMs,
      atlas: sample.atlasMs,
      payload: sample.payloadMs,
      group: sample.groupMs,
      mesh: sample.meshMs,
      first_render: sample.firstRenderMs,
      reveal: sample.revealMs,
      total: sample.totalMs,
    });
    emitMetric(emit, "minebench.voxel.build", 1, tags);
  }
}
