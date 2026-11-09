# Field Repair

Bundled survival plugin: a **single-use emergency hull stabilizer** for voyages
in trouble. It is the opposite of an economy plugin — it generates nothing,
costs nothing, and then it is gone.

## Mechanic

- **Trigger:** whenever the hull is at or below **30** (critical) in a live
  voyage, the stabilizer auto-deploys and repairs **+25 hull** (clamped to the
  hull cap by the host).
- **Single use per voyage:** after one successful deploy the charge is spent
  for the rest of that voyage — including across save/load and plugin
  reloads. The durable flag is stored under the `stabilizer` storage key;
  an in-memory latch does the fast per-session guard.
- **No resurrection:** it never fires in the `DEAD` or `STRANDED` phases.
  If the host rejects the grant, the charge is not burned and the plugin
  logs the failure.
- **Visible log:** the deploy line (`... deployed at jump N (hull H, +25
  hull)`) plus a `ready` / `spent` status line on every `afterJump`, so the
  player can always see whether the one charge remains.

Placement matters: `afterAction` fires after an action's costs and yields
have been applied, so this snaps back exactly the hull lost to failed hunts,
drilling, or maze blasts. `afterJump` also covers arriving at a new realm
already critical. A desperate scavenge is player-chosen hull sacrifice that
fires no plugin event, so it does not fire the stabilizer on its own — the
next action or jump does.

## Balance

+25 hull once per voyage is deliberately modest: it rescues a voyage that is
about to hit the death threshold (0) or stranded threshold, but it does not
replace repeatable repairs such as the hub rest (+30 hull for 20 flux, hub
only) or the goblin engineer's trickle. The threshold (30) is the critical
band: above it the stabilizer stays silent and useful time is never wasted
while the hull is still comfortable.

## Files

- `manifest.json` — plugin identity + permissions (see `src/game/manifest.ts`).
  Only `voyage:adjustResource` is requested: the entire mutation surface is
  one clamped hull delta. No network access, no core changes.
- `main.js` — single self-contained ES module; no imports (the host inlines
  the file into a blob worker, so relative imports would not resolve).
- The entry default-exports a top-level `plugin` object with required
  `mount(api)` and `unmount()` methods; host API v4.

## Activation

The plugin listens for `afterAction` and `afterJump`. Those hooks run after
damage lands and after entering a new realm, so the stabilizer can respond at
the right time without a nonfunctional menu action or node.

## Zip + install

```sh
cd packages/field-repair && zip -r field-repair.zip manifest.json main.js
```

Then install `field-repair.zip` from the game's plugin install UI (file
input) — or `PluginHost.loadZip()` in code. See `src/game/host.ts`. The
bundled copy served by the game lives at `public/plugins/field-repair.zip`.
