# Salvage Scanner

Plugin for the Rift Rails plugin system. It registers one action
(`scan_salvage`), one node (`wreck_field`), and listens to the
`beforeAction`, `afterAction`, and `afterJump` events. Pure
logging/storage only — no game mutations.

## Files

- `manifest.json` — plugin identity + permissions (see `src/game/manifest.ts`).
- `main.js` — single self-contained ES module; no imports (the host inlines
  the file into a blob worker, so relative imports would not resolve).

## Manifest

Fields (validated by `parseManifest`):

| field         | meaning                                                        |
| ------------- | -------------------------------------------------------------- |
| `id`          | 1-64 chars, `[a-z0-9_-]` (e.g. `salvage-scanner`).              |
| `name`        | Display name.                                                  |
| `version`     | Semver `x.y.z`.                                                |
| `minApi`      | Minimum host API required. Host is `HOST_API_VERSION = 1` (`src/game/workerProtocol.ts`); this plugin declares `1`. |
| `entry`       | In-zip path of the entry module (`.js`/`.mjs`, no `..`).       |
| `permissions` | Subset of: `*`, `voyage:adjustResource`, `voyage:executeAction`, `voyage:explore`, `voyage:desperate`. This plugin declares `[]` (log/storage only). |

## Plugin API

`activate(api)` is called once with a sandboxed `api`:

- `api.registerAction({ id, label })` / `api.registerNode({ id, label })`
- `api.on(event, fn)` for `beforeAction`, `afterAction`, `afterJump`, ...
- `api.state()` — frozen snapshot of the latest game state.
- `api.log(msg)` — forwarded to the host log.
- `api.storage.get/set(key, value)` — namespaced per-plugin storage.
  This plugin stores `jumpsScanned` (jump count at last `afterJump`).

## Zip + install

```sh
cd packages/salvage-scanner && zip -r salvage-scanner.zip manifest.json main.js
```

Then install `salvage-scanner.zip` from the game's plugin install UI (file
input) — or `PluginHost.loadZip()` in code. See `src/game/host.ts`.
