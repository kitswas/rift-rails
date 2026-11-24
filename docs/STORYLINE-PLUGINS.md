# Storyline Plugins

Storyline plugins add optional dialogue scenes through the host API. They are
narrative-only: they register a definition, wait for real game actions, and log
consequences. They never call `api.grant` (grants are rejected while the game is
in `DIALOGUE`/`JUMPING`), never edit core engine files, and never bump the save
version.

Two bundled examples ship today: `rail-keeper` and `glass-courier`. Each owns
its own original cast.

## Definition schema

`api.registerStoryline(def)` accepts a JSON-only object shaped as follows
(`validateStoryline` in `src/game/storyline.ts` is the authority):

| Field | Rule |
| --- | --- |
| `id` | `/^[a-z0-9][a-z0-9_-]{0,31}$/i`; unique per plugin |
| `title` | non-empty, at most 120 chars |
| `description` | non-empty, at most 500 chars |
| `start` | trigger that begins the story; `afterAction`, `afterJump`, or `onEnter` |
| `first` | id of the entry node; this node must not have a `trigger` |
| `nodes` | 1–16 nodes; whole definition serialized under 64 KiB |

Each node has `id`, `actor` (≤80), `verb` (≤80), `target` (≤120), `outcome`
(≤240), `text` (≤2000), optional `trigger`, and 1–2 `choices`. Choice ids must
be unique; `next` is a node id or `null`. All node ids referenced by `next`
must exist, every node must be reachable from `first`, and there must be no
cycles. `onEnter` triggers are limited to `START`, `IDLE`, and `ENCOUNTER`.

Triggers:

```ts
{ event: "afterAction", actionId: "res_harvest", success: true }
{ event: "afterJump", jumpCount: 2 }
{ event: "onEnter", phase: "ENCOUNTER" }
```

`actionId` must be a real key of `GAME_DATA.actions` (`src/game/data.ts`); the
host emits `afterAction` with `{ actionId, success }` (`src/main.ts`).

## X-verb-Y chain rule

Write each scene as a subject–verb–object triplet: `A verb B`. A follow-up
scene keeps the chain by reusing one participant with a new actor: `C verb A`
or `C verb B`. The branch's `verb` is the player's next verb in the game, so
its `actionId` must name the action with that verb.

Example (`rail-keeper`):

- `The splintered tie pinches the vapor vent` — `A verb B`.
- `Keeper Halden drills the splintered tie` — `C verb A`, waits for `res_drill`.
- `Keeper Halden siphons the vapor vent` — `C verb B`, waits for `res_siphon`.

## Branch-by-next-verb pattern

1. Pick three distinct real actions: one for `start`, one per branch.
2. Give `first` exactly two choices pointing at the two branch nodes. The
   overlay choice selects **which verb to wait for**; it does not resolve the
   branch by itself.
3. Each branch node carries `trigger: { event: "afterAction", actionId: <real
   action id>, success: true }` and exactly one terminal choice (`next: null`).
4. `StorylineService` marks progress `waiting` when the player picks a branch.
   An unrelated action or a failed action does nothing; the first matching
   successful `afterAction` presents the branch node, whose terminal choice
   completes the story and records the outcome trace.
5. In an `api.on("afterAction", ...)` listener, call `api.log` once when a
   branch action fires, guarding the write with `api.storage` (seed from
   storage at mount, serialize writes, keep an in-memory `Set`). Never grant
   resources or mutate the voyage.

## Adding a plugin

1. Create `packages/<id>/manifest.json`:
   `{ "id": "<id>", "name": "...", "version": "1.0.0", "minApi": 4,
   "entry": "main.js", "permissions": [], "description": "...",
   "defaultEnabled": false }`. `pnpm plugins:build` copies these fields into
   the registry and computes the zip's SHA-256.
2. Create `packages/<id>/main.ts`: import the `PluginLifecycle` type, declare a
   top-level `const plugin`, call `api.registerStoryline(...)` exactly once in
   `mount`, add the narrative `afterAction` listener, export the plugin as
   default. The host concatenates the bootstrap, built output, and kickoff, so
   the top-level `plugin` binding is required.
3. Add `<id>` to `PLUGINS` in `scripts/build-plugins.mjs` and run
   `pnpm plugins:build`. The build is deterministic (fixed entry order, fixed
   timestamps) and regenerates `public/plugins/registry.json`. Commit the new
   zip and registry. The registry is the only plugin source; there is no
   manual install list in `src/ui/panels.ts`.
4. Add `tests/<id>.test.ts`: import the real lifecycle and manifest, assert the
   captured definition passes `validateStoryline`, check every trigger action
   is real and distinct, drive `StorylineService` with `afterAction` events to
   prove both branches resolve, and check log deduplication. Avoid brittle
   snapshots.
5. Run `pnpm plugins:build`, then `pnpm format:check`, `pnpm typecheck`,
   `pnpm lint`, `pnpm check:docs` and `pnpm test`.

## How opt-in works

`defaultEnabled: false` means the registry entry is **not** loaded on a first
run. `loadRegistryPlugins` (`src/ui/panels.ts`) loads default-on entries plus any
id listed in the `rift.plugins.enabled` localStorage key. To opt in, open
**Settings → Plugins** and toggle the entry on. The panel downloads the zip from
the registry, verifies its SHA-256, checks its manifest, and mounts it. The
toggle can disable it again; on the next launch the same enable list is
restored. There is no manual `.zip` install — see
[Plugin registry](PLUGIN-REGISTRY.md). The Corvus tutorial is a special case
with its own start-screen checkbox (`src/game/tutorial.ts`).
