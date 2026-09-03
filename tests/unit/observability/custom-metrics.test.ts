import assert from "node:assert/strict";
import {
  clientMetricBatchSchema,
  emitClientCustomMetrics,
  type CustomMetricEmitter,
} from "../../../lib/observability/customMetrics";
import { POST } from "../../../app/api/observability/client-metrics/route";

type Emission = {
  name: string;
  value: number;
  tags: Record<string, string>;
};

const validVoxelSample = {
  kind: "voxel" as const,
  surface: "builder" as const,
  variant: "full" as const,
  strategy: "worker-facts" as const,
  cacheStatus: "miss" as const,
  blockCountBucket: "150k-300k" as const,
  renderedBlockCountBucket: "150k-300k" as const,
  animated: false,
  queueMs: 1,
  atlasMs: 2,
  payloadMs: 300,
  groupMs: 30,
  meshMs: 330,
  firstRenderMs: 16,
  revealMs: 0,
  totalMs: 350,
};

async function main() {
  // The batch schema is strict: unknown keys and unknown surfaces are refused
  // rather than forwarded as metric dimensions.
  assert.equal(clientMetricBatchSchema.safeParse({ samples: [validVoxelSample] }).success, true);
  assert.equal(
    clientMetricBatchSchema.safeParse({ samples: [{ ...validVoxelSample, extra: 1 }] }).success,
    false,
  );
  assert.equal(
    clientMetricBatchSchema.safeParse({ samples: [{ ...validVoxelSample, surface: "arena" }] })
      .success,
    false,
  );
  assert.equal(clientMetricBatchSchema.safeParse({ samples: [] }).success, false);

  const emissions: Emission[] = [];
  const emit: CustomMetricEmitter = (name, value, tags = {}) => {
    emissions.push({ name, value, tags });
  };

  emitClientCustomMetrics([validVoxelSample], emit);

  assert.ok(
    emissions.some(
      (entry) => entry.name === "minebench.voxel.stage_ms" && entry.tags.stage === "first_render",
    ),
  );
  assert.ok(emissions.some((entry) => entry.name === "minebench.voxel.build" && entry.value === 1));
  for (const entry of emissions) {
    assert.equal(entry.tags.surface, "builder");
    assert.equal(entry.tags.block_bucket, "150k-300k");
  }

  // A null stage is left out rather than reported as zero.
  const withoutReveal: Emission[] = [];
  emitClientCustomMetrics(
    [{ ...validVoxelSample, revealMs: null }],
    (name, value, tags = {}) => withoutReveal.push({ name, value, tags }),
  );
  assert.equal(
    withoutReveal.some((entry) => entry.tags.stage === "reveal"),
    false,
  );

  // The ingest route only accepts same-origin posts of a valid batch.
  const origin = "https://minebench.test";
  const request = new Request(`${origin}/api/observability/client-metrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify({ samples: [validVoxelSample] }),
  });
  const response = await POST(request);
  assert.equal(response.status, 204);

  const invalid = new Request(`${origin}/api/observability/client-metrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify({ samples: [{ kind: "voxel" }] }),
  });
  assert.equal((await POST(invalid)).status, 400);

  console.log("custom metrics ok");
}

void main();
