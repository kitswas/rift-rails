# Rift Storm

Plugin for the Rift Rails plugin system. Registers action `storm_ride`
(Ride the Storm) and node `storm_eye` (Storm Eye). On `afterJump`,
storm intensity is `jumpCount % 5`, stored as `lastStorm`, and logged.
Every 3rd jump (`jumpCount % 3 === 0`) grants +5 flux via
`adjustResource` (requires `voyage:adjustResource`).

## Files

- `manifest.json` — plugin identity + permissions (see `src/game/manifest.ts`).
- `main.js` — single self-contained ES module; no imports, no DOM/window/fetch.

## Manifest

Fields (validated by `parseManifest`):

| field         | meaning                                                        |
| ------------- | -------------------------------------------------------------- |
| `id`          | `rift-storm`.                                                  |
| `name`        | Display name (`Rift Storm`).                                   |
| `version`     | Semver `1.0.0`.                                                |
| `minApi`      | Minimum host API required. Host is `HOST_API_VERSION = 3` (`src/game/workerProtocol.ts`); this plugin declares `1`. |
| `entry`       | Entry module (`main.js`).                                      |
| `permissions` | `["voyage:adjustResource"]` (grants `adjustResource` flux +5). |

## Plugin API

`activate(api)` is called once with a sandboxed `api`:

- `api.registerAction({ id, label })` / `api.registerNode({ id, label })`
- `api.on("afterJump", fn)` — storm intensity, storage, log, flux grant.
- `api.state()` — frozen snapshot (`jumpCount`, `flux`, ...).
- `api.grant(op)` — mutation only way; `adjustResource` needs its permission.
- `api.storage.set("lastStorm", value)` — namespaced per-plugin storage.
- `api.log(msg)` — forwarded to the host log.

## Zip + install

```sh
cd packages/rift-storm && zip -r rift-storm.zip manifest.json main.js
```

Then install `rift-storm.zip` from the game's plugin install UI.
