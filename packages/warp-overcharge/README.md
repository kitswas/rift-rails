# Warp Overcharge

Warp energy plugin for the Rift Rails plugin system. It registers the
`overcharge` action (`Warp Overcharge`) and the `overcharge_bay` node
(`Overcharge Bay`), and listens to the `afterJump` event.

## Files

- `manifest.json` — plugin identity + permissions (see `src/game/manifest.ts`).
- `main.js` — single self-contained ES module; no imports (the host inlines
  the file into a blob worker, so relative imports would not resolve).

## Manifest

Fields (validated by `parseManifest`):

| field         | meaning                                                        |
| ------------- | -------------------------------------------------------------- |
| `id`          | `warp-overcharge` (1-64 chars, `[a-z0-9_-]`).                  |
| `name`        | `Warp Overcharge`                                              |
| `version`     | Semver `x.y.z`.                                                |
| `minApi`      | Minimum host API required. Host is `HOST_API_VERSION = 1` (`src/game/workerProtocol.ts`); this plugin declares `1`. |
| `entry`       | In-zip path of the entry module (`.js`/`.mjs`, no `..`).       |
| `permissions` | Subset of: `*`, `voyage:adjustResource`, `voyage:executeAction`, `voyage:explore`, `voyage:desperate`. This plugin uses `voyage:adjustResource`. |

## Behavior

- `activate(api)` registers action `overcharge` and node `overcharge_bay`.
- On `afterJump`, if `energy >= 3` it logs `overcharge ready`, otherwise
  it logs `overcharge charging`.
- On `afterJump`, if `energy < 2`, it grants `adjustResource` `energy +1`
  (requires `voyage:adjustResource`); the grant is bounded by the host's
  resource bounds.
- On `afterJump`, it persists `lastOverchargeJump` (the current
  `jumpCount`) via `api.storage.set`.
- `api.state()` returns the latest snapshot; `api.log(msg)` forwards to
  the host log; `api.grant(op)` is the only mutation path.

## Zip + install

```sh
cd packages/warp-overcharge && zip -r warp-overcharge.zip manifest.json main.js
```

Then install `warp-overcharge.zip` from the game's plugin install UI
(file input) — or `PluginHost.loadZip()` in code. See `src/game/host.ts`.
