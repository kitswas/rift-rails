# Contract Board

Contract plugin for the Rift Rails plugin system. It registers one action
(`contract_take`, label `Take Contract`), one node (`contract_hub`), and
listens to the `afterJump` and `onSave` events.

## Files

- `manifest.json` — plugin identity + permissions (see `src/game/manifest.ts`).
- `main.js` — single self-contained ES module; no imports (the host inlines
  the file into a blob worker, so relative imports would not resolve).

## Manifest

Fields (validated by `parseManifest`):

| field         | meaning                                                        |
| ------------- | -------------------------------------------------------------- |
| `id`          | 1-64 chars, `[a-z0-9_-]` (e.g. `contract-board`).              |
| `name`        | Display name.                                                  |
| `version`     | Semver `x.y.z`.                                                |
| `minApi`      | Minimum host API required. Host is `HOST_API_VERSION = 1` (`src/game/workerProtocol.ts`); this plugin declares `1`. |
| `entry`       | In-zip path of the entry module (`.js`/`.mjs`, no `..`).       |
| `permissions` | Subset of: `*`, `voyage:adjustResource`, `voyage:executeAction`, `voyage:explore`, `voyage:desperate`. This plugin requests none (`[]`) and uses no grants. |

## Plugin API

`activate(api)` is called once with a sandboxed `api`:

- `api.registerAction({ id, label })` / `api.registerNode({ id, label })`
- `api.on(event, fn)` for `afterJump`, `onSave`, `afterAction`, ...
- `api.state()` — frozen snapshot of the latest game state.
- `api.storage.get/set(key, value)` — namespaced per-plugin storage.
- `api.log(msg)` — forwarded to the host log.

Behaviour:

- `onSave`: increments `contractsDone` in namespaced storage.
- `afterJump`: logs `contract bonus` when `rep >= 2` in the state snapshot.
- No grants: this plugin never calls `api.grant()`.

## Zip + install

```sh
cd packages/contract-board && zip -r contract-board.zip manifest.json main.js
```

Then install `contract-board.zip` from the game's plugin install UI (file
input) — or `PluginHost.loadZip()` in code. See `src/game/host.ts`.
