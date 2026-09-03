import type { BlockDefinition } from "@/lib/blocks/palettes";
import type { ResolvedBlock } from "@/lib/palette/types";
import { buildLitematic, type LitematicOptions } from "@/lib/voxel/export/litematic";
import { buildVoxelExportGeometry } from "@/lib/voxel/export/geometry";
import { buildVoxelGlb } from "@/lib/voxel/export/glb";
import { buildSpongeSchematic } from "@/lib/voxel/export/schematic";
import { buildVoxelStl } from "@/lib/voxel/export/stl";
import { buildVoxelVox } from "@/lib/voxel/export/vox";
import type { VoxelBuild } from "@/lib/voxel/types";

export type VoxelBuildExportFormat = "glb" | "stl" | "schem" | "vox";

// Litematica is exported from a resolved build rather than from a VoxelBuild,
// because it carries block states and a VoxelBuild has none.
export type ResolvedBuildExportFormat = "litematic";

export type VoxelBuildExportStats = {
  inputBlockCount: number;
  exportedBlockCount: number;
  visibleFaceCount?: number;
  triangleCount?: number;
  materialCount?: number;
  width?: number;
  height?: number;
  length?: number;
  volume?: number;
  paletteSize?: number;
};

export type VoxelBuildExportArtifact = {
  bytes: Uint8Array;
  extension: VoxelBuildExportFormat;
  mimeType: string;
  stats: VoxelBuildExportStats;
};

export function exportVoxelBuild(
  build: VoxelBuild,
  palette: BlockDefinition[],
  format: VoxelBuildExportFormat,
): VoxelBuildExportArtifact {
  if (format === "vox") {
    const vox = buildVoxelVox(build, palette);
    return {
      bytes: vox.bytes,
      extension: "vox",
      mimeType: "application/octet-stream",
      stats: {
        inputBlockCount: build.blocks.length,
        exportedBlockCount: vox.stats.blockCount,
        ...vox.stats,
      },
    };
  }

  if (format === "schem") {
    const schematic = buildSpongeSchematic(build, palette);
    return {
      bytes: schematic.bytes,
      extension: "schem",
      mimeType: "application/octet-stream",
      stats: {
        inputBlockCount: build.blocks.length,
        exportedBlockCount: schematic.stats.blockCount,
        ...schematic.stats,
      },
    };
  }

  const geometry = buildVoxelExportGeometry(build, palette);
  const bytes = format === "glb" ? buildVoxelGlb(geometry) : buildVoxelStl(geometry);

  return {
    bytes,
    extension: format,
    mimeType: format === "glb" ? "model/gltf-binary" : "model/stl",
    stats: {
      inputBlockCount: geometry.inputBlockCount,
      exportedBlockCount: geometry.exportedBlockCount,
      visibleFaceCount: geometry.visibleFaceCount,
      triangleCount: geometry.triangleCount,
      materialCount: geometry.materialCount,
    },
  };
}

export { buildVoxelExportGeometry } from "@/lib/voxel/export/geometry";
export { buildVoxelGlb } from "@/lib/voxel/export/glb";
export { buildSpongeSchematic } from "@/lib/voxel/export/schematic";
export { buildVoxelStl } from "@/lib/voxel/export/stl";
export { buildVoxelVox } from "@/lib/voxel/export/vox";

export type ResolvedBuildExportArtifact = {
  bytes: Uint8Array;
  extension: ResolvedBuildExportFormat;
  mimeType: string;
  stats: VoxelBuildExportStats;
};

export function exportResolvedBuild(
  blocks: readonly ResolvedBlock[],
  format: ResolvedBuildExportFormat,
  options: LitematicOptions = {},
): ResolvedBuildExportArtifact {
  const litematic = buildLitematic(blocks, options);
  return {
    bytes: litematic.bytes,
    extension: format,
    mimeType: "application/octet-stream",
    stats: {
      inputBlockCount: blocks.length,
      exportedBlockCount: litematic.stats.blockCount,
      width: litematic.stats.width,
      height: litematic.stats.height,
      length: litematic.stats.length,
      volume: litematic.stats.volume,
      paletteSize: litematic.stats.paletteSize,
    },
  };
}

export {
  buildLitematic,
  readLitematic,
  LITEMATIC_DATA_VERSION,
  LITEMATIC_SUB_VERSION,
  LITEMATIC_VERSION,
} from "@/lib/voxel/export/litematic";
