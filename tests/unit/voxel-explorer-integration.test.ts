import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const launcher = read("components/voxel/VoxelExplorerLauncher.tsx");
const viewerCard = read("components/voxel/VoxelViewerCard.tsx");
const explorer = read("components/voxel/VoxelExplorer.tsx");

assert.match(read("app/layout.tsx"), /<VoxelExplorerProvider>/);
assert.match(launcher, /Explore this build\?/);
assert.match(launcher, /Step inside at block scale with keyboard and mouse\./);
assert.match(launcher, /onKeyDown=\{\(event\) => event\.stopPropagation\(\)\}/);
assert.match(explorer, /onClick=\{onExit\}[\s\S]*?>\s*Exit\s*</);
assert.match(viewerCard, /showBuildView && !explorerActive/);

// The explorer walks a build that is already in memory. There is no build
// catalogue to browse and no arena endpoint to fetch from.
assert.doesNotMatch(explorer, /\/api\/arena|\/api\/gallery|\/api\/sandbox/);
assert.doesNotMatch(explorer, /ExplorerBuildMenu/);

console.log("voxel explorer integration checks passed");
