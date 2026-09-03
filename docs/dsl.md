# The build DSL

A build is a program. The program describes structure in semantic roles, never
in Minecraft blocks. A deterministic compiler turns the program into a grid of
roles, and a palette resolves those roles into concrete blocks afterwards. That
is why palettes can be swapped, budgets applied, and modpacks supported without
generating the build again.

This file is the single source of truth for the op list. The system prompt
handed to the model is generated from this file, and a test fails if the two
drift apart or if the code exposes an op that is not documented here.

## Shape of a program

```js
build(ctx => {
  const m = ctx.mass({ w: 13, d: 9 });
  m.storeys({ count: 2, height: 4 });

  m.walls({ role: 'wall_primary' });
  m.corners({ role: 'structure_post' });
  m.floor({ storey: 0, role: 'floor' });

  m.mirrorX(() => {
    m.opening({ face: 'north', x: 2, y: 2, w: 1, h: 2, role: 'glass' });
  });

  m.gableRoof({ axis: 'x', pitch: 1, overhang: 1,
                role: 'roof_primary', trimRole: 'roof_trim' });

  m.door({ face: 'south', x: 0, role: 'door' });
});
```

`build` is called exactly once. `ctx.mass` is called exactly once and returns
the mass handle every other op hangs off. `ctx.rng()` returns a seeded random
number in `[0, 1)`; the same seed always produces the same sequence.

## Coordinates

- `x` runs east, `z` runs south, `y` runs up. North is `-z`, west is `-x`.
- The mass footprint is centred on the origin. A mass of `w: 13` spans
  `x` from `-6` to `6`; an even `w: 12` spans `-6` to `5`.
- `y = 0` is the ground floor level of storey 0.
- Storey `s` spans `y` from `s * height` to `(s + 1) * height - 1`. Its floor
  layer is `y = s * height` and its wall band is
  `y = s * height + 1` up to `(s + 1) * height - 1`.
- The roof starts one block above the top wall block, at `y = count * height`.

## Rules

- Every op takes a `role`, never a block id. Passing a block id is an error.
- Ops are declarative. Where two ops write the same coordinate, the later op
  wins, so cut openings after the walls they pass through.
- `mirrorX`, `mirrorZ` and `repeat` are compiler operations. Write one half or
  one bay and let the compiler produce the rest. Never emit a symmetric half
  twice by hand; symmetry is exact only when the compiler makes it.
- Any invalid argument is an error that names the op, its position in the
  program and its arguments. Nothing is skipped quietly.
- Block states such as stair facing, slab half and log axis are decided by the
  compiler from the geometry, not by the program.

## Roles

`wall_primary`, `wall_secondary`, `structure_post`, `structure_beam`,
`foundation`, `floor`, `ceiling`, `roof_primary`, `roof_trim`, `roof_support`,
`glass`, `door`, `trim`, `accent`, `light`, `path`.

## Ops

### `mass({ w, d })`

Declares the footprint, centred on the origin, and returns the mass handle.
`w` and `d` are 3 to 128. Required, exactly once.

### `storeys({ count, height })`

Sets the storey count (1 to 12, default 1) and the vertical pitch of each
storey including its floor layer (2 to 24, default 4). Must be called before
any geometry op.

### `walls({ role, storey })`

Fills the perimeter ring of the wall band with `role`. Without `storey`, every
storey is walled.

### `corners({ role, storey })`

Fills the four corner columns of the wall band with `role`, overwriting the
wall there. Carries an `axis: y` hint so the palette can pick an upright log.
Without `storey`, every storey gets corners.

### `floor({ role, storey })`

Fills the whole footprint at the floor layer of `storey` (default 0).

### `ceiling({ role, storey })`

Fills the whole footprint at the layer directly above `storey`.

### `foundation({ role, depth })`

Fills the whole footprint from `y = -1` down to `y = -depth` (1 to 16,
default 1).

### `opening({ face, x, y, w, h, role })`

Cuts a `w` by `h` hole in the given wall face. `face` is `north`, `south`,
`east` or `west`. `x` is the offset of the opening centre from the centre of
that face, positive toward east on north and south faces and toward south on
east and west faces. `y` is absolute build height. With `role` the hole is
filled with that role, typically `glass`; without `role` it is left open. The
opening must lie inside the face and inside the wall band, otherwise the op
fails.

### `door({ face, x, role, storey })`

A one wide, two tall opening at the bottom of the wall band of `storey`
(default 0), filled with `role`. `x` follows the same face-centre convention as
`opening`.

### `window({ face, x, y, w, h, role })`

`opening` with a required `role`. Use it when the hole is always filled.

### `gableRoof({ axis, pitch, overhang, role, trimRole, infillRole })`

A ridged roof. `axis` is `x` or `z` and gives the direction the ridge runs
(default `x`). `pitch` is the rise in blocks per block of run (1 to 4,
default 1). `overhang` extends the roof past the walls on all four sides (0 to
8, default 0). The sloped surface is emitted as stairs with the facing derived
from the slope, and the ridge row as full blocks. `trimRole` is used for the
roof cells outside the wall footprint, which is the overhang. `infillRole`
fills the gable triangles between the wall top and the roof surface at the two
ends; without it those ends are left open.

### `hipRoof({ pitch, overhang, role, trimRole })`

A roof that slopes toward all four sides. Parameters match `gableRoof`, with
corner stair shapes derived by the compiler.

### `flatRoof({ role, overhang, trimRole })`

A single flat layer at the roof base. `trimRole` is used for the overhang.

### `post({ x, z, from, to, role })`

A vertical column at `x, z` between heights `from` and `to`, inclusive, with an
`axis: y` hint.

### `beam({ from, to, role, axis })`

An axis-aligned run of blocks between two points, inclusive. Exactly one of
`x`, `y`, `z` may differ between `from` and `to`. `axis` overrides the axis
hint the compiler would otherwise derive.

### `platform({ x, z, w, d, y, role, form })`

A horizontal patch of `w` by `d` centred on `x, z` at height `y`. `form` is
`full` or `slab` (default `full`).

### `stairsRun({ from, to, role })`

A staircase between two points, rising exactly one block per block of run,
along a single horizontal axis. Facing is derived from the direction of climb.

### `fill({ from, to, role, form })`

Fills the box between two points, inclusive. The escape hatch for shapes the
structural ops do not cover. `form` is `full`, `slab` or `stair`.

### `clear({ from, to })`

Removes every cell in the box between two points, inclusive.

### `mirrorX(body)`

Runs `body` once and reflects everything it produced across the mass centre
line perpendicular to `x`, swapping east and west in every derived block state.
Both halves come from the compiler, so they cannot drift.

### `mirrorZ(body)`

The same reflection across the mass centre line perpendicular to `z`, swapping
north and south.

### `repeat({ count, step }, body)`

Runs `body` once and places `count` copies of the result, each offset by a
further `step`. `count` is 1 to 64 and `step` must move on at least one axis.

### `translate({ x, y, z }, body)`

Runs `body` once and moves everything it produced by the given offset.
