// Plugins panel: mounts into Settings pane (pane-settings).
import type { PluginHost } from "../game/host";

export const ENABLED_KEY = "rift.plugins.enabled";
export const ZIPS_KEY = "rift.plugins.zips";
const MAX_STORED_ZIP_BYTES = 1 * 1024 * 1024;
const MAX_STORED_ZIPS_TOTAL = 4 * 1024 * 1024;

export function readEnabled(): string[] {
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writeEnabled(ids: string[]): void {
  try {
    localStorage.setItem(ENABLED_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable (private mode) */
  }
}

function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
}

export function readStoredZips(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ZIPS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === "string") out[k] = v;
    return out;
  } catch {
    return {};
  }
}

export function storeZip(id: string, buf: ArrayBuffer): boolean {
  if (buf.byteLength > MAX_STORED_ZIP_BYTES) return false;
  try {
    const stored = readStoredZips();
    stored[id] = bytesToBase64(buf);
    const json = JSON.stringify(stored);
    if (json.length > MAX_STORED_ZIPS_TOTAL) return false;
    localStorage.setItem(ZIPS_KEY, json);
    return true;
  } catch {
    return false;
  }
}

export function getStoredZip(id: string): ArrayBuffer | null {
  const b64 = readStoredZips()[id];
  if (!b64) return null;
  try {
    const buf = base64ToBytes(b64);
    return buf.byteLength > MAX_STORED_ZIP_BYTES ? null : buf;
  } catch {
    return null;
  }
}

export async function rehydratePlugins(host: PluginHost): Promise<string[]> {
  const loaded: string[] = [];
  for (const id of readEnabled()) {
    if (host.isPluginActive(id)) continue;
    const buf = getStoredZip(id);
    if (!buf) continue;
    try {
      await host.loadZip(buf);
      loaded.push(id);
    } catch {
      /* stale zip; user must reinstall */
    }
  }
  return loaded;
}

// Vite copies public/ to dist/; keep bundled zips in public/plugins/ (not dist/plugins/).
const BUNDLED_PLUGINS: readonly { id: string; url: string }[] = [
  { id: "black-market", url: "./plugins/black-market.zip" },
  { id: "rift-storm", url: "./plugins/rift-storm.zip" },
  { id: "contract-board", url: "./plugins/contract-board.zip" },
  { id: "salvage-scanner", url: "./plugins/salvage-scanner.zip" },
  { id: "warp-overcharge", url: "./plugins/warp-overcharge.zip" },
];

export async function loadBundledPlugins(host: PluginHost, hooks: PanelsHooks): Promise<string[]> {
  const enabled = readEnabled();
  const firstRun = enabled.length === 0; // first run: enable all bundled by default
  const targets = BUNDLED_PLUGINS.filter((p) => firstRun || enabled.includes(p.id));
  const results = await Promise.allSettled(
    targets.map(async (p) => {
      if (host.isPluginActive(p.id)) return p.id;
      const res = await fetch(p.url);
      if (res.status === 404) return null; // missing zip: ignore silently
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const manifest = await host.loadZip(await res.arrayBuffer());
      return manifest.id;
    }),
  );
  const loaded: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      if (r.value) loaded.push(r.value);
    } else {
      hooks.onLog(
        `bundled plugin failed: ${targets[i]?.id ?? "?"}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
      );
    }
  });
  if (firstRun && loaded.length) writeEnabled([...new Set([...enabled, ...loaded])]);
  return loaded;
}

export interface PanelsHooks {
  onLog: (msg: string) => void;
}

/**
 * Mounts the Plugins panel inside the Settings pane.
 * File picker (.zip) → host.loadZip → enable/disable toggles persisted
 * in localStorage; errors shown in #plugin-error.
 */
export function mountPluginsPanel(host: PluginHost, hooks: PanelsHooks): { refresh: () => void } {
  const pane = document.getElementById("pane-settings");
  const parent: HTMLElement | null = pane ?? document.body;

  const section = document.createElement("section");
  section.id = "plugins-panel";
  section.innerHTML = `<h3>Plugins</h3>
    <input type="file" id="plugin-file" accept=".zip" />
    <div id="plugin-error" role="alert" style="color: var(--danger, #ef4444); min-height: 1em;"></div>
    <div id="plugin-list"></div>`;

  parent.appendChild(section);

  const errorEl = section.querySelector<HTMLDivElement>("#plugin-error");
  const listEl = section.querySelector<HTMLDivElement>("#plugin-list");
  const fileInput = section.querySelector<HTMLInputElement>("#plugin-file");

  const setError = (msg: string): void => {
    if (errorEl) errorEl.textContent = msg;
  };
  const enabledSet = new Set(readEnabled());

  const buffers = new Map<string, ArrayBuffer>();

  const refresh = (): void => {
    if (!listEl) return;
    enabledSet.clear();
    for (const id of readEnabled()) enabledSet.add(id); // reflect bundled first-run enable
    listEl.innerHTML = "";
    for (const p of host.listPlugins()) {
      const row = document.createElement("div");
      row.className = "plugin-row";
      const label = document.createElement("span");
      label.textContent = `${p.name} v${p.version}${p.active ? "" : " (disabled)"}`;
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = enabledSet.has(p.id) && p.active;
      toggle.dataset.pluginId = p.id;
      toggle.addEventListener("change", () => {
        if (toggle.checked) {
          void enable(p.id);
        } else {
          disable(p.id);
        }
      });
      row.append(label, toggle);
      listEl.appendChild(row);
    }
  };

  const persist = (): void => writeEnabled([...enabledSet]);

  const disable = (id: string): void => {
    host.disable(id, "user-disabled");
    enabledSet.delete(id);
    persist();
    refresh();
    hooks.onLog(`Plugin disabled: ${id}`);
  };

  const enable = async (id: string): Promise<void> => {
    const buf = buffers.get(id) ?? getStoredZip(id);
    if (!buf) {
      enabledSet.add(id);
      persist();
      refresh();
      hooks.onLog(`Plugin enabled: ${id} (zip not stored; please reinstall)`);
      return;
    }
    try {
      const m = await host.loadZip(buf);
      enabledSet.add(m.id);
      persist();
      setError("");
      refresh();
      hooks.onLog(`Plugin enabled: ${m.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      refresh();
    }
  };

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      void (async () => {
        try {
          const buf = await file.arrayBuffer();
          const manifest = await host.loadZip(buf);
          buffers.set(manifest.id, buf);
          if (!storeZip(manifest.id, buf)) {
            hooks.onLog(`Plugin ${manifest.id} zip not stored (size cap); reinstall after reload`);
          }
          enabledSet.add(manifest.id);
          persist();
          setError("");
          refresh();
          hooks.onLog(`Plugin loaded: ${manifest.id} (${manifest.name} ${manifest.version})`);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          fileInput.value = "";
        }
      })();
    });
  }

  refresh();
  void rehydratePlugins(host).then((ids) => {
    if (ids.length) {
      for (const id of ids) hooks.onLog(`Plugin rehydrated: ${id}`);
      refresh();
    }
  });
  return { refresh };
}
