# MineBench

**A generator for Minecraft builds you can actually put up in survival.**

You describe a build. A model writes a short program that describes its
structure. A deterministic compiler executes that program into a grid of
semantic roles, a palette resolves those roles into concrete blocks, a
validation pass reports anything structurally wrong, and the result renders in
3D and exports to Litematica.

This is a fork of [MineBench](https://github.com/Ammaar-Alam/minebench), which
was a benchmark that ranked models by having them emit raw voxel coordinates
and voting on the results. The benchmark is gone; the renderer, the export
path, and the generation plumbing are kept.

## Why a program instead of coordinates

Emitting block coordinates directly makes error accumulate with the size of the
build, drifts symmetry, and produces output that cannot be edited or given a
different palette without generating the whole thing again.

A program is short, reviewable and re-runnable. `mirrorX` and `repeat` are
compiler operations, so symmetry is exact by construction rather than something
the model has to type out twice and get right.

## The pipeline

```
prompt + palette constraints
  -> [1] the model emits a DSL program (structure only, no block ids)
  -> [2] a deterministic compiler executes it into a grid of roles
  -> [3] a palette resolver maps roles to concrete blocks
  -> repair and validation -> render -> export
```

Stages 1 and 2 never see a Minecraft block id. They work in semantic roles such
as `wall_primary`, `structure_post` and `roof_trim`. Block identity is decided
last, which is what makes palette swapping, cost budgets and modpack support
possible without regenerating anything.

| Stage | Where |
| --- | --- |
| DSL runtime and sandbox | `lib/dsl/`, documented in [docs/dsl.md](docs/dsl.md) |
| Compiler | `lib/compile/` |
| Palette, ramps, cost budgets | `lib/palette/` |
| Structural validation | `lib/repair/` |
| Renderer | `lib/voxel/`, `components/voxel/` |
| Export | `lib/voxel/export/` |

## The builder

The home page is the builder: a prompt box and model picker, the build program
in an editable panel with a Run button, the 3D preview, the palette editor with
block search and colour swatches, a budget selector with a live cost readout,
the validation findings, and the export buttons.

Editing the palette or the budget re-resolves the build in place. Only Generate
and Run go near a model or the compiler.

## Exports

- **Litematica** (`.litematic`) is the primary target. It carries block states
  and gives the player a material list, which is what the cost budget is for.
  The format is pinned to schematic version 6 (subversion 1) and was verified
  against Litematica's own source rather than from memory.
- Sponge schematic (`.schem`), MagicaVoxel (`.vox`), glTF (`.glb`) and STL.
- Building Gadgets JSON is a later addition.

## Palettes and budgets

A palette maps each role to a block, optionally with a block state, and can
point a role at a colour ramp ordered by Oklab lightness. Swapping a palette
re-resolves the existing build without running the model again.

Budgets measure a build against a cost ceiling and a limit on distinct blocks,
because a blocklist cannot express that four gold blocks of trim are fine while
eight hundred as roofing are not. Presets ship for early survival, an
established base, and creative.

## Local development

```bash
pnpm install
pnpm db:up
pnpm prisma:migrate
pnpm dev
```

See [docs/local-development.md](docs/local-development.md) for the full setup,
including the environment variables in `.env.example`.

```bash
pnpm check              # lint, tests and a production build
pnpm test               # unit, config and repo tests
pnpm test:integration   # PostgreSQL integration tests
pnpm dsl:prompt         # regenerate the system prompt from docs/dsl.md
pnpm catalogue:build    # regenerate the block catalogue from the texture pack
```

## Documentation

[docs/README.md](docs/README.md) is the index.

## License

MIT. See [LICENSE](LICENSE).
