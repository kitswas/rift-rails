# Plugin registry

The registry is the only source of plugins. There is no manual `.zip` install in the UI; all plugins are fetched from the registry, hash-verified, and checked against their manifest before mounting.

## Schema

`public/plugins/registry.json` (served as `./plugins/registry.json`):

```json
{
  "version": 1,
  "plugins": [
    {
      "id": "rift-salvager",
      "name": "Rift Salvager",
      "version": "1.0.0",
      "description": "Short player-facing summary.",
      "defaultEnabled": true,
      "source": "./rift-salvager.zip",
      "sha256": "<64 lowercase hex chars>",
      "minApi": 4,
      "permissions": ["voyage:adjustResource"]
    }
  ]
}
```

`version` must be `1`. `id`, `name`, `version`, `description`, `source`, `sha256`, `minApi`, and `permissions` are required on every entry. The registry is validated on load; an invalid document is rejected.

## Source resolution

`source` is resolved relative to the registry URL (`registryUrl`), so a registry at `./plugins/registry.json` with `source: "./foo.zip"` fetches `./plugins/foo.zip` from the same origin. The registry itself is loaded from `import.meta.env.VITE_PLUGIN_REGISTRY || "./plugins/registry.json"`.

## Verification and manifest checks

For every plugin the host:

1. Downloads the zip from `source` and verifies its **SHA-256** against `sha256`. A mismatch rejects the plugin; it is never mounted or enabled.
2. Reads `manifest.json` from the verified zip and requires `minApi` and `permissions` to equal the registry entry. A mismatch rejects the plugin.
3. Only then calls `host.loadZip(bytes)`.

Failures are logged to the game log and shown in the Plugins panel. A rejected plugin is never silently enabled.

## Default and opt-in behavior

- First run (no stored enable list): entries with `defaultEnabled: true` **and** a compatible `minApi` are enabled and loaded. Everything else is shown in the panel as disabled but visible.
- Later runs: only ids in the stored enable list are loaded. Each is still re-downloaded, hash-verified, and manifest-checked on every load.
- Toggling a plugin on re-runs the full verification + manifest check + load. On failure the toggle reverts to off and the error is shown in `#plugin-error`. Toggling off disables and unmounts it.

## Custom registry

Set `VITE_PLUGIN_REGISTRY` at build time (see `.env.example`):

```
VITE_PLUGIN_REGISTRY=./plugins/registry.json
```

If the registry cannot be fetched or fails validation, the game logs a clear error and continues with zero plugins.

## CSP limitation

The browser's Content Security Policy applies to registry and zip fetches. A custom registry must be **same-origin** with the game unless the host widens its `connect-src` directive to allow the remote origin; otherwise the fetch is blocked before validation runs.

## No manual install

The old file-picker and stored-zip path were removed. Plugins can only come from the registry.
