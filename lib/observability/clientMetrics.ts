import { MESH_FACTS_MIN_BLOCKS } from "@/lib/voxel/meshFacts";
import type { VoxelViewerBuildMetrics } from "@/components/voxel/VoxelViewer";
import type { ClientMetricSample } from "@/lib/observability/customMetrics";
import {
  getBlockCountBucket,
  roundMetricMs,
} from "@/lib/observability/metricBuckets";

type BuildVariant = "preview" | "full";
type MetricSurface = "builder" | "viewer";

const MAX_BATCH_SIZE = 50;
const FLUSH_DELAY_MS = 1_000;
const pendingSamples: ClientMetricSample[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushClientMetrics() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  const samples = pendingSamples.splice(0, MAX_BATCH_SIZE);
  if (samples.length === 0) return;

  void fetch("/api/observability/client-metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ samples }),
    keepalive: true,
  }).catch(() => undefined);

  if (pendingSamples.length > 0) {
    flushTimer = setTimeout(flushClientMetrics, FLUSH_DELAY_MS);
  }
}

export function enqueueClientMetric(sample: ClientMetricSample) {
  if (typeof window === "undefined") return;
  pendingSamples.push(sample);
  if (pendingSamples.length >= MAX_BATCH_SIZE) {
    flushClientMetrics();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flushClientMetrics, FLUSH_DELAY_MS);
  }
}

export function enqueueVoxelMetric(
  surface: MetricSurface,
  variant: BuildVariant,
  metrics: VoxelViewerBuildMetrics,
) {
  enqueueClientMetric({
    kind: "voxel",
    surface,
    variant,
    strategy: metrics.strategy,
    cacheStatus: metrics.cacheStatus,
    blockCountBucket: getBlockCountBucket(metrics.inputBlockCount),
    renderedBlockCountBucket: getBlockCountBucket(metrics.renderedBlockCount),
    animated: metrics.animated,
    queueMs: roundMetricMs(metrics.queueMs),
    atlasMs: roundMetricMs(metrics.atlasMs),
    payloadMs: roundMetricMs(metrics.payloadMs),
    groupMs: roundMetricMs(metrics.groupMs),
    meshMs: roundMetricMs(metrics.meshMs),
    firstRenderMs: roundMetricMs(metrics.firstRenderMs),
    revealMs: roundMetricMs(metrics.revealMs),
    totalMs: roundMetricMs(metrics.totalMs),
  });
}
