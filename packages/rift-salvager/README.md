# Rift Salvager

Gameplay plugin for the Rift Rails plugin system. It adds one
player-initiated economy action, **Salvage Melt**, on one node,
**Salvage Yard**:

- **Salvage Melt** (`salvage_melt`): consumes 1 Energy + 10 Fuel,
  produces 20 Flux.
- **Salvage Yard** (`salvage_yard`): the node that lists the action.

The player chooses when to pay the energy and fuel for deterministic
flux — for example when fuel is surplus and a forge upgrade
(75 Flux) or yard purchase is out of reach, away from hub contracts.
The melt count per jump is audited in plugin storage
(`meltsThisJump`, reset on `afterJump`; `lastJump` records the jump).

## Why this is balanced

Rates are taken from the baseline economy in `src/game/data.ts`:

| Option | Cost | Yield | Where |
| --- | --- | --- | --- |
| Supply Delivery (`hub_quest_easy`) | 10 Fuel | 35 Flux + 1 Rep | Hub only |
| Safe Harvest (`res_harvest`) | 1 Energy | 30 Flux | Resource node only |
| **Salvage Melt** | **1 Energy + 10 Fuel** | **20 Flux** | **Salvage Yard** |
| Refuel Canisters (`hub_fuel`) | 20 Flux | 30 Fuel | Hub only |

Salvage Melt is strictly worse per fuel than the hub contract and
worse per energy than Safe Harvest, and it is also worse than the
Safe Harvest → Refuel chain (1 Energy → 30 Flux → 30 Fuel at Tier 0) as an
energy→fuel loop. It does not beat any baseline option in its own
niche; its only advantage is availability: guaranteed flux at the
Salvage Yard without combat risk, when fuel is surplus and the
better options are not reachable. Energy is capped per jump
(2 + engine tier) and refreshes by spending fuel on a jump, so
repeated melting is self-limiting. The plugin issues no grants,
grants no passive income, and needs no permissions.

## Files

- `manifest.json` — plugin identity + permissions (see `src/game/manifest.ts`).
- `main.js` — single self-contained ES module; no imports (the host inlines
  the file into a blob worker, so relative imports would not resolve).

## Manifest

| field | value |
| ----- | ----- |
| `id` | `rift-salvager` |
| `name` | `Rift Salvager` |
| `version` | `1.0.0` |
| `minApi` | `4` (host is `HOST_API_VERSION = 4`, `src/game/workerProtocol.ts`) |
| `entry` | `main.js` |
| `permissions` | `[]` (no `api.grant()` or network use) |

## Plugin API used

- `api.registerAction({ id, label, desc, consumes, produces, logSuccess })` —
  numeric rules only, resources limited to `hull/fuel/energy/flux/rep`
  (`src/game/host.ts`, `parseActionDef`).
- `api.registerNode({ id, label, desc, exploreCost, isHub, actions })` —
  `actions` are namespaced to `rift-salvager:salvage_melt` by the host.
- `api.on("afterAction", fn)` — real payload `{ actionId, success }`
  (`src/main.ts`); counts successful `salvage_melt` executions.
- `api.on("afterJump", fn)` — real payload `{ jumpCount }`
  (`src/main.ts`); resets the per-jump melt counter.
- `api.storage.get/set` — namespaced per-plugin storage.
- `api.log` — forwarded to the host log.

The entry defines a top-level `plugin` object with required `mount(api)` and
`unmount()` methods, then default-exports it. The host runs `mount` on enable
and awaits `unmount` before worker shutdown.

## Zip + install

```sh
cd packages/rift-salvager && zip -r rift-salvager.zip manifest.json main.js
```

The bundled copy lives at `public/plugins/rift-salvager.zip`. Install
it from the game's plugin install UI (file input) — or
`PluginHost.loadZip()` in code. See `src/game/host.ts`. Focused proof:
`tests/rift-salvager.test.ts`.
