# MineBench Operations and API Reference

Use this guide for generation behaviour, runtime details, and the API surface.

## Generation behaviour

All runtime model generations use `voxel.exec` tool mode today: the model emits
a tool-call envelope (`tool: voxel.exec` plus JavaScript), MineBench executes
that code server side, and the artifact stored and rendered is build JSON in
`version`/`boxes`/`lines`/`blocks` form.

The DSL pipeline in `lib/dsl/`, `lib/compile/` and `lib/palette/` is the
replacement for that path and is documented in [The build DSL](./dsl.md) and
[Architecture](./architecture.md). Generation is wired to it as part of the
builder UI work; until then both exist side by side.

Full runtime notes for the current path: [Voxel Exec Runtime, Conversion, and
Import Workflows](./voxel-exec-raw-output.md).

### Build JSON schema

```json
{
  "version": "1.0",
  "boxes": [
    { "x1": 10, "y1": 0, "z1": 10, "x2": 20, "y2": 6, "z2": 20, "type": "stone" }
  ],
  "lines": [
    { "from": { "x": 15, "y": 7, "z": 15 }, "to": { "x": 15, "y": 18, "z": 15 }, "type": "oak_log" }
  ],
  "blocks": [
    { "x": 15, "y": 19, "z": 15, "type": "glowstone" }
  ]
}
```

Validation expands `boxes` and `lines`, normalises and drops invalid block
types, drops out-of-bounds coordinates, deduplicates, and enforces the block
limits.

Current generation constraints:

- grid sizes: `64`, `256`, `512`
- minimum blocks: `200`, `500`, `800`
- maximum blocks: `196,608`, `2,000,000`, `4,000,000`

Render palettes `simple` and `advanced` are defined in
`lib/blocks/palettes.json`. The block catalogue the palette layer resolves
against is generated separately with `pnpm catalogue:build`.

### Rate limiting

Middleware rate limits API routes to `18 requests / 10 seconds` per IP and path,
with tighter windows for contact submissions and generation creation.
Parameterised routes share one bucket, so walking through ids does not dodge the
limit.

## API reference

### Public routes

- `POST /api/generate`
  - body: `{ prompt, gridSize, palette, modelKeys, providerKeys? }`
  - response: `application/x-ndjson` stream (`hello`, `start`, `retry`,
    `delta`, `result`, `error`, `ping`)
- `GET /api/generation-options` lists the models and settings the UI may offer
- `POST /api/local/voxel-exec` runs a program locally during development
- `POST /api/presence` records anonymous presence
- `POST /api/contact` submits the contact form
- `GET /api/faq` returns the FAQ content

### Saved generations

Saved generations are private and account owned.

- `POST /api/generations` creates one durable job per selected model
- `GET /api/generations` lists the current account's jobs and results
- `GET|DELETE /api/generations/$GENERATION_ID` reads or removes one owned generation
- `POST /api/generations/$GENERATION_ID/cancel` cancels active work
- `POST /api/generations/$GENERATION_ID/retry` retries a failed generation
- `GET /api/generations/$GENERATION_ID/download` redirects canonical JSON to private Storage
- `GET /api/generations/$GENERATION_ID/artifacts/$KIND` serves one stored artifact

### Account routes

- `GET|PATCH|DELETE /api/account` reads the account, updates the public
  nickname, or deletes the account
- `POST|DELETE /api/account/session` finishes a sign in or rotates the session

## Worker

Generation runs as a durable job queue drained by a worker:

```bash
pnpm generations:worker
```

`pnpm generations:artifacts:audit` reports stored artifacts that no longer have
a matching generation.

## Database notes

Prisma models:

- `User`
- `CustomBuild`, `CustomBuildJob`, `CustomBuildArtifact`, `CustomBuildEvent`,
  `CustomBuildSecret`, `CustomBuildStatsDaily`
- `PublicSessionActivity`

Prisma creates quoted PascalCase table names in Postgres. When querying
manually, use quoted identifiers:

```sql
select count(*) from public."CustomBuild";
```
