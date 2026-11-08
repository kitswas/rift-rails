# Black Market

Trade-talk plugin for the Rift Rails plugin system. It registers node
`black_market` and action `bm_trade` (\"Black Market Trade\"), and listens
to `afterJump`: from jump 2 onward it logs the jump and bumps a per-plugin
`stint` storage counter. No mutations, so `permissions` is empty.

## Files

- `manifest.json` — plugin identity + permissions (see `src/game/manifest.ts`).
- `main.js` — single self-contained ES module; no imports (the host inlines
  the file into a blob worker, so relative imports would not resolve).

## Manifest

Fields (validated by `parseManifest`):

| field         | meaning                                                        |
| ------------- | -------------------------------------------------------------- |
| `id`          | 1-64 chars, `[a-z0-9_-]` (here `black-market`).                |
| `name`        | Display name (`Black Market`).                                 |
| `version`     | Semver `x.y.z`.                                                |
| `minApi`      | Minimum host API required. Host is `HOST_API_VERSION = 1` (`src/game/workerProtocol.ts`); this plugin declares `1`. |
| `entry`       | In-zip path of the entry module (`.js`/`.mjs`, no `..`).       |
| `permissions` | `[]` — events + logs + storage only; no `api.grant()` calls.   |

## Plugin API (worker-only)

`activate(api)` is called once with a sandboxed `api`:

- `api.registerAction({ id, label, desc })` / `api.registerNode({ id, label, desc })`
- `api.on(event, fn)` — here `afterJump` only.
- `api.state()` — frozen snapshot of the latest game state.
- `api.log(msg)` — forwarded to the host log.
- `api.storage.get/set(key, value)` — namespaced per-plugin storage
  (here the `stint` counter).

No DOM/window/localStorage/fetch; no `api.grant()`.

## Zip + install

```sh
cd packages/black-market && zip -r black-market.zip manifest.json main.js
```

Then install `black-market.zip` from the game's plugin install UI (file
input) — or `PluginHost.loadZip()` in code. See `src/game/host.ts`.
