import assert from "node:assert/strict";
import { getBlock } from "../../../lib/palette/blocks";
import { oklabLightness, rgbToOklab } from "../../../lib/palette/oklab";
import { orderRamp, rampIndexFor } from "../../../lib/palette/ramps";

// Oklab, checked against the reference values in Björn Ottosson's writeup.
{
  const white = rgbToOklab({ r: 255, g: 255, b: 255 });
  assert.ok(Math.abs(white.l - 1) < 1e-3);
  assert.ok(Math.abs(white.a) < 1e-3);
  assert.ok(Math.abs(white.b) < 1e-3);

  const black = rgbToOklab({ r: 0, g: 0, b: 0 });
  assert.equal(black.l, 0);

  // Perceptual lightness is not an RGB average: pure green reads far lighter
  // than pure blue even though both have one channel at full.
  assert.ok(oklabLightness({ r: 0, g: 255, b: 0 }) > oklabLightness({ r: 0, g: 0, b: 255 }));
}

// A ramp is ordered by perceptual lightness, darkest first, not by name and not
// by an RGB channel.
{
  const members = [
    "minecraft:polished_deepslate",
    "minecraft:deepslate_tiles",
    "minecraft:cobbled_deepslate",
  ];
  const ordered = orderRamp(members);
  assert.equal(ordered.length, 3);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = getBlock(ordered[index - 1] ?? "");
    const current = getBlock(ordered[index] ?? "");
    assert.ok(previous && current);
    assert.ok(
      previous.color.lightness <= current.color.lightness,
      `${previous.id} should not be lighter than ${current.id}`,
    );
  }
  // The input order does not matter.
  assert.deepEqual(orderRamp(members.slice().reverse()), ordered);
}

// Bare ids are namespaced, and a block outside the catalogue sorts last but
// keeps a stable position.
{
  const ordered = orderRamp(["stone", "modpack:unknown_block", "minecraft:deepslate"]);
  assert.equal(ordered[0], "minecraft:deepslate");
  assert.equal(ordered[2], "modpack:unknown_block");
  assert.deepEqual(orderRamp(["modpack:unknown_block", "stone", "minecraft:deepslate"]), ordered);
}

// Selection is a hash of the coordinate, so it does not depend on the order
// cells are walked in, and it stays inside the ramp.
{
  for (let x = -20; x <= 20; x += 1) {
    for (let y = 0; y < 8; y += 1) {
      const index = rampIndexFor(x, y, x * 3, 3);
      assert.ok(index >= 0 && index < 3);
      assert.equal(rampIndexFor(x, y, x * 3, 3), index);
    }
  }
  assert.equal(rampIndexFor(4, 4, 4, 1), 0);

  // Neighbouring cells do not all draw the same shade, otherwise a ramp would
  // be a single block with extra steps.
  const sample = new Set<number>();
  for (let x = 0; x < 24; x += 1) sample.add(rampIndexFor(x, 3, 1, 3));
  assert.ok(sample.size > 1);
}

console.log("palette ramps ok");
