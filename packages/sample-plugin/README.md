# Sample Plugin

Minimal plugin for the Rift Rails plugin system. It registers one action
(`smuggle_fuel`), one node (`smuggle_point`), and listens to the `afterJump`
and `onSave` events.

## Files

- `manifest.json` — plugin identity + permissions (see `src/game/manifest.ts`).
- `main.js` — single self-contained ES module; no imports (the host inlines
  the file into a blob worker, so relative imports would not resolve).

## Manifest

Fields (validated by `parseManifest`):

| field         | meaning                                                        |
| ------------- | -------------------------------------------------------------- |
| `id`          | 1-64 chars, `[a-z0-9_-]` (e.g. `sample-plugin`).               |
| `name`        | Display name.                                                  |
| `version`     | Semver `x.y.z`.                                                |
| `minApi`      | Minimum host API required. Host is `HOST_API_VERSION = 1` (`src/game/workerProtocol.ts`); this plugin declares `1`. |
| `entry`       | In-zip path of the entry module (`.js`/`.mjs`, no `..`).       |
| `permissions` | Subset of: `*`, `voyage:adjustResource`, `voyage:executeAction`, `voyage:explore`, `voyage:desperate`. |

## Plugin API

`activate(api)` is called once with a sandboxed `api`:

- `api.registerAction({ id, label })` / `api.registerNode({ id, label })`
- `api.on(event, fn)` for `afterJump`, `onSave`, `afterAction`, ...
- `api.state()` — frozen snapshot of the latest game state.
- `api.grant(op)` — the only way to mutate the game; each op kind requires its
  permission (`adjustResource` needs `voyage:adjustResource`, etc.). Grant
  amounts are capped (`MAX_GRANT_AMOUNT`), resources are closed-set.
- `api.storage.get/set(key, value)` — namespaced per-plugin storage.
- `api.log(msg)` — forwarded to the host log.

## Zip + install

```sh
cd packages/sample-plugin && zip -r sample-plugin.zip manifest.json main.js
```

Then install `sample-plugin.zip` from the game's plugin install UI (file
input) — or `PluginHost.loadZip()` in code. See `src/game/host.ts`.
