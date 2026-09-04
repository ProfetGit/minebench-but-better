export type BlockCountBucket =
  | "unknown"
  | "empty"
  | "under-8k"
  | "8k-50k"
  | "50k-150k"
  | "150k-300k"
  | "300k-1m"
  | "1m-plus";

export function roundMetricMs(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

// Block counts are bucketed rather than reported raw so a metric dimension has
// a bounded cardinality.
export function getBlockCountBucket(blockCount: number | null | undefined): BlockCountBucket {
  if (blockCount == null || !Number.isFinite(blockCount) || blockCount < 0) return "unknown";
  if (blockCount === 0) return "empty";
  if (blockCount < 8_000) return "under-8k";
  if (blockCount < 50_000) return "8k-50k";
  if (blockCount < 150_000) return "50k-150k";
  if (blockCount < 300_000) return "150k-300k";
  if (blockCount < 1_000_000) return "300k-1m";
  return "1m-plus";
}
