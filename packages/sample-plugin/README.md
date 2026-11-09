# Sample Plugin

Minimal plugin for the Rift Rails plugin system. It registers one action
(`smuggle_fuel`), one node (`smuggle_point`), one branching storyline, and
listens to the `afterJump` and `onSave` events.

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
| `minApi`      | Minimum host API required. Host is `HOST_API_VERSION = 2` (`src/game/workerProtocol.ts`); this plugin declares `2` for storyline registration. |
| `entry`       | In-zip path of the entry module (`.js`/`.mjs`, no `..`).       |
| `permissions` | Subset of: `*`, `voyage:adjustResource`, `voyage:executeAction`, `voyage:explore`, `voyage:desperate`. |

## Plugin API

`activate(api)` is called once with a sandboxed `api`:

- `api.registerAction({ id, label })` / `api.registerNode({ id, label })`
- `api.registerStoryline(definition)` registers an auto-starting story. Story
  definitions are data-only and survive save/load through the host journal.
- `api.on(event, fn)` for `afterJump`, `onSave`, `afterAction`, ...
- `api.state()` — frozen snapshot of the latest game state.
- `api.grant(op)` — the only way to mutate the game; each op kind requires its
  permission (`adjustResource` needs `voyage:adjustResource`, etc.). Grant
  amounts are capped (`MAX_GRANT_AMOUNT`), resources are closed-set.
- `api.storage.get/set(key, value)` — namespaced per-plugin storage.
- `api.log(msg)` — forwarded to the host log.

## Storylines

Every story has an `id`, `title`, `description`, `start`, `first`, and `nodes`.
Start triggers support `afterJump` (`jumpCount`), `afterAction` (`actionId`,
optional `success`), and `onEnter` (`phase` required: `START`, `IDLE`, or
`ENCOUNTER`). Triggers match exact values. A node may also have
a trigger; the game waits for that event after the previous choice.

Each node contains `actor`, `verb`, `target`, `outcome`, display `text`,
optional `trigger`, and one or two `choices`. Each choice has a unique local
`id`, a button `label`, and `next` node ID or `null` to finish the story. The
graph must be acyclic, fully reachable, and contain at most 16 nodes. The host
supports up to 32 saved stories. Each step and choice appears in the Story
Journal trace.

```js
api.registerStoryline({
  id: "lost-lantern",
  title: "The Lost Lantern",
  description: "A signal asks the Conductor to choose.",
  start: { event: "afterJump", jumpCount: 2 },
  first: "signal",
  nodes: [{
    id: "signal",
    actor: "Rail Signal",
    verb: "calls",
    target: "the locomotive",
    outcome: "the Conductor must choose whether to answer",
    text: "A lantern flickers from a dead spur.",
    choices: [
      { id: "answer", label: "Answer", next: "ending" },
      { id: "pass", label: "Pass", next: "ending" }
    ]
  }, {
    id: "ending",
    actor: "Conductor",
    verb: "records",
    target: "the signal",
    outcome: "the coordinate is preserved",
    text: "The lantern fades into the fog.",
    choices: [{ id: "continue", label: "Continue", next: null }]
  }]
});
```

## Zip + install

```sh
cd packages/sample-plugin && zip -r sample-plugin.zip manifest.json main.js
```

Then install `sample-plugin.zip` from the game's plugin install UI (file
input) — or `PluginHost.loadZip()` in code. See `src/game/host.ts`.
