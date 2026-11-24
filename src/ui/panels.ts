// Plugins panel: mounts into Settings pane (pane-settings). Registry is the sole plugin list.
import JSZip from "jszip";
import type { PluginHost } from "../game/host";
import { parseManifest } from "../game/manifest";
import type { PluginManifest } from "../game/manifest";
import type { PluginRegistry, PluginRegistryEntry } from "../game/pluginRegistry";
import { downloadVerifiedPlugin, isEntryCompatible } from "../game/pluginRegistry";

export const ENABLED_KEY = "rift.plugins.enabled";

function parseEnabled(): string[] {
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function readEnabled(): string[] {
  return parseEnabled();
}

export function writeEnabled(ids: string[]): void {
  try {
    localStorage.setItem(ENABLED_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable (private mode) */
  }
}

function rawEnabledKey(): string | null {
  try {
    return localStorage.getItem(ENABLED_KEY);
  } catch {
    return null;
  }
}

export interface PanelsHooks {
  onLog: (msg: string) => void;
}

function failureMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

async function readManifest(bytes: ArrayBuffer): Promise<PluginManifest> {
  const zip = await JSZip.loadAsync(bytes);
  const file = zip.file("manifest.json");
  if (!file) throw new Error("manifest.json missing from zip");
  return parseManifest(JSON.parse(await file.async("string")) as unknown);
}

/** Download + hash-verify, then require the zip manifest to match its registry entry. */
async function fetchVerifiedBytes(
  entry: PluginRegistryEntry,
  registryUrl: string,
): Promise<ArrayBuffer> {
  const { bytes } = await downloadVerifiedPlugin(entry, registryUrl);
  const manifest = await readManifest(bytes);
  if (manifest.id !== entry.id) throw new Error(`manifest id mismatch for ${entry.id}`);
  if (manifest.minApi !== entry.minApi) throw new Error(`manifest minApi mismatch for ${entry.id}`);
  const actual = [...manifest.permissions].sort().join(",");
  const expected = [...entry.permissions].sort().join(",");
  if (actual !== expected) throw new Error(`manifest permissions mismatch for ${entry.id}`);
  return bytes;
}

async function loadEntry(
  host: PluginHost,
  entry: PluginRegistryEntry,
  registryUrl: string,
): Promise<string> {
  if (host.isPluginActive(entry.id)) {
    await host.waitUntilReady(entry.id);
    return entry.id;
  }
  await host.loadZip(await fetchVerifiedBytes(entry, registryUrl));
  return entry.id;
}

/** First run enables compatible defaults; later runs use stored ids. Rejections stay disabled. */
export async function loadRegistryPlugins(
  host: PluginHost,
  hooks: PanelsHooks,
  registry: PluginRegistry,
  registryUrl: string,
): Promise<string[]> {
  const enabled = readEnabled();
  const firstRun = rawEnabledKey() === null;
  const targets = firstRun
    ? registry.plugins.filter((entry) => entry.defaultEnabled && isEntryCompatible(entry))
    : registry.plugins.filter((entry) => enabled.includes(entry.id));
  const results = await Promise.allSettled(
    targets.map((entry) => loadEntry(host, entry, registryUrl)),
  );
  const loaded: string[] = [];
  results.forEach((result, i) => {
    const entry = targets[i];
    if (result.status === "fulfilled") {
      loaded.push(result.value);
    } else {
      hooks.onLog(`registry plugin failed: ${entry?.id ?? "?"}: ${failureMessage(result.reason)}`);
    }
  });
  if (firstRun) writeEnabled([...new Set([...enabled, ...loaded])]);
  return loaded;
}

export function mountPluginsPanel(
  host: PluginHost,
  hooks: PanelsHooks,
  registry: PluginRegistry,
  registryUrl: string,
): { refresh: () => void } {
  const pane = document.getElementById("pane-settings");
  if (!pane) {
    hooks.onLog("plugins panel: #pane-settings missing; panel not mounted");
    return { refresh: () => {} };
  }
  document.getElementById("plugins-panel")?.remove(); // guard against double-mount
  const parent: HTMLElement =
    (pane.querySelector(".settings-content") as HTMLElement | null) ?? pane;

  const section = document.createElement("section");
  section.className = "settings-section";
  section.id = "plugins-panel";
  section.innerHTML = `<h3 style="color: var(--info); letter-spacing: 1px">[ PLUGINS // LEYRIG ]</h3><p id="plugin-status" aria-live="polite"></p><p id="plugin-error" role="alert"></p><div id="plugin-list"></div>`;

  parent.appendChild(section);

  const errorEl = section.querySelector<HTMLParagraphElement>("#plugin-error");
  const statusEl = section.querySelector<HTMLParagraphElement>("#plugin-status");
  const listEl = section.querySelector<HTMLDivElement>("#plugin-list");

  const setError = (msg: string): void => {
    if (errorEl) errorEl.textContent = msg;
  };
  const verified = new Set<string>();
  const failed = new Map<string, string>();
  const enabledSet = new Set(readEnabled());

  const statusOf = (entry: PluginRegistryEntry): string => {
    if (failed.has(entry.id)) return "failed";
    if (!isEntryCompatible(entry)) return "incompatible";
    return host.isPluginActive(entry.id) || verified.has(entry.id) ? "verified" : "unverified";
  };

  const refresh = (): void => {
    if (!listEl) return;
    enabledSet.clear();
    for (const id of readEnabled()) enabledSet.add(id); // reflect first-run defaults
    const activeCount = registry.plugins.filter((entry) => host.isPluginActive(entry.id)).length;
    if (statusEl) statusEl.textContent = `${activeCount} active`;
    // Keep keyboard focus on the same plugin's toggle across the rebuild.
    const focusedId =
      document.activeElement instanceof HTMLInputElement
        ? document.activeElement.dataset.pluginId
        : undefined;
    listEl.replaceChildren();
    for (const entry of registry.plugins) {
      const active = host.isPluginActive(entry.id);
      const row = document.createElement("div");
      row.className = "audio-control-row plugin-row";
      row.dataset.pluginId = entry.id;
      const label = document.createElement("span");
      label.textContent = `${entry.name} v${entry.version}${active ? "" : " (disabled)"} — ${entry.description} — ${statusOf(entry)}`;
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = enabledSet.has(entry.id) && active;
      toggle.dataset.pluginId = entry.id;
      toggle.setAttribute("aria-label", `Toggle plugin ${entry.name}`);
      toggle.addEventListener("change", () => {
        if (toggle.checked) void enable(entry);
        else disable(entry);
      });
      row.append(label, toggle);
      listEl.appendChild(row);
    }
    if (focusedId) {
      const restored = [...listEl.querySelectorAll<HTMLInputElement>("input[data-plugin-id]")].find(
        (t) => t.dataset.pluginId === focusedId,
      );
      restored?.focus();
    }
  };

  const persist = (): void => writeEnabled([...enabledSet]);

  const disable = (entry: PluginRegistryEntry): void => {
    host.disable(entry.id, "user-disabled");
    enabledSet.delete(entry.id);
    persist();
    setError("");
    refresh();
    hooks.onLog(`Plugin disabled: ${entry.id}`);
  };

  const enable = async (entry: PluginRegistryEntry): Promise<void> => {
    try {
      if (!isEntryCompatible(entry)) throw new Error(`plugin ${entry.id} is incompatible`);
      await host.waitUntilStopped(entry.id);
      const bytes = await fetchVerifiedBytes(entry, registryUrl);
      await host.loadZip(bytes);
      verified.add(entry.id);
      failed.delete(entry.id);
      enabledSet.add(entry.id);
      persist();
      setError("");
      refresh();
      hooks.onLog(`Plugin enabled: ${entry.id}`);
    } catch (err) {
      const msg = failureMessage(err);
      enabledSet.delete(entry.id);
      failed.set(entry.id, msg);
      setError(msg);
      refresh();
      hooks.onLog(`Plugin enable failed: ${entry.id}: ${msg}`);
    }
  };

  refresh();
  return { refresh };
}
