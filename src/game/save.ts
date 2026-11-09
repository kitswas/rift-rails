import type { AudioPrefs, SerializedVoyage } from "./types";
import type { Voyage } from "./voyage";
import type { SoundFXService } from "./audio";

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export interface PersistedPayload extends SerializedVoyage {
  enabledPlugins: string[];
  version?: number;
  hostStorage?: Record<string, Record<string, unknown>>;
}

export const SAVE_VERSION = 1;
const MAX_ARRAY_LEN = 1000;
const MAX_PLUGIN_KEYS = 200;
const MAX_PLUGIN_BYTES = 64 * 1024;
const MAX_STORY_KEYS = 32;
const MAX_STORY_TRACE = 16;

export interface SaveDeps {
  storage: StorageLike;
  voyage: Voyage;
  getEnabledPlugins?: () => string[];
  getHostStorage?: () => Record<string, Record<string, unknown>>;
  restoreHostStorage?: (storage: Record<string, Record<string, unknown>>) => void;
  setTimeoutFn?: (cb: () => void, ms: number) => void;
  sound?: Pick<SoundFXService, "prefsSnapshot">;
  log?: (msg: string) => void;
  warn?: (msg: string, err?: unknown) => void;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v) || v.length > MAX_ARRAY_LEN) return [];
  return v.filter((x): x is string => typeof x === "string").slice(0, MAX_ARRAY_LEN);
}

function isFiniteInRange(v: unknown, min: number, max: number): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

function isValidPayload(v: unknown): v is PersistedPayload {
  if (!isRecord(v)) return false;
  if (!isFiniteInRange(v["jumpCount"], 1, 1_000_000)) return false;
  if (!isFiniteInRange(v["hull"], 0, 10_000)) return false;
  if (!isFiniteInRange(v["fuel"], 0, 1_000_000)) return false;
  if (!isFiniteInRange(v["flux"], 0, 1_000_000)) return false;
  if (!isFiniteInRange(v["rep"], 0, 1_000_000)) return false;
  if (!isFiniteInRange(v["energy"], 0, 10_000)) return false;
  if (!isFiniteInRange(v["engineTier"], 0, 100)) return false;
  if (!isFiniteInRange(v["weaponTier"], 0, 100)) return false;
  if (!Array.isArray(v["seenCutscenes"]) || v["seenCutscenes"].length > MAX_ARRAY_LEN) return false;
  if (!v["seenCutscenes"].every((x) => typeof x === "string")) return false;
  if (!Array.isArray(v["sectorBag"]) || v["sectorBag"].length > MAX_ARRAY_LEN) return false;
  if (!v["sectorBag"].every((x) => typeof x === "string")) return false;
  if (!isRecord(v["pluginState"]) || Object.keys(v["pluginState"]).length > MAX_PLUGIN_KEYS) return false;
  try {
    if ((JSON.stringify(v["pluginState"]) ?? "").length > MAX_PLUGIN_BYTES) return false;
  } catch {
    return false;
  }
  const storyProgress = v["storyProgress"];
  if (storyProgress !== undefined) {
    if (!isRecord(storyProgress) || Object.keys(storyProgress).length > MAX_STORY_KEYS) return false;
    for (const [key, progress] of Object.entries(storyProgress)) {
      if (key.length > 100) return false;
      if (!isRecord(progress)) return false;
      if (progress["status"] !== "active" && progress["status"] !== "complete") return false;
      if (typeof progress["nodeId"] !== "string" || progress["nodeId"].length > 32) return false;
      if (typeof progress["waiting"] !== "boolean") return false;
      if (!Array.isArray(progress["trace"]) || progress["trace"].length > MAX_STORY_TRACE) return false;
      if (!progress["trace"].every((entry) =>
        isRecord(entry) &&
        typeof entry["nodeId"] === "string" &&
        typeof entry["choiceId"] === "string" &&
        entry["nodeId"].length <= 32 &&
        entry["choiceId"].length <= 32
      )) return false;
    }
    try {
      if ((JSON.stringify(storyProgress) ?? "").length > MAX_PLUGIN_BYTES) return false;
    } catch {
      return false;
    }
  }
  if (v["version"] !== undefined && !isFiniteInRange(v["version"], 1, SAVE_VERSION + 10)) return false;
  return true;
}

function deepClonePayload(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v)) as unknown;
}

function migrate(parsed: unknown): PersistedPayload | null {
  if (!isRecord(parsed)) return null;
  if (parsed["version"] !== undefined && parsed["version"] !== SAVE_VERSION) {
    return null;
  }
  const cloned = deepClonePayload(parsed) as Record<string, unknown>;
  cloned["pluginState"] ??= {};
  cloned["storyProgress"] ??= {};
  if (!isValidPayload(cloned)) return null;
  const rawState: unknown = cloned["pluginState"];
  const pluginState: Record<string, unknown> = isRecord(rawState) ? { ...rawState } : {};
  const rawHost: unknown = cloned["hostStorage"];
  const hostStorage: Record<string, Record<string, unknown>> =
    isRecord(rawHost) ? (deepClonePayload(rawHost) as Record<string, Record<string, unknown>>) : {};
  return {
    ...(cloned as SerializedVoyage),
    version: SAVE_VERSION,
    pluginState,
    hostStorage,
    enabledPlugins: toStringArray(cloned["enabledPlugins"]),
  };
}

export function migratePayload(parsed: unknown): PersistedPayload | null {
  return migrate(parsed);
}

export class SaveSystem {
  static readonly STORAGE_KEY = "rift_rails_auto_save";
  static readonly AUDIO_KEY = "rift_rails_audio_prefs";

  private readonly storage: StorageLike;
  private readonly voyage: Voyage;
  private readonly getEnabledPlugins: (() => string[]) | undefined;
  private readonly getHostStorage: (() => Record<string, Record<string, unknown>>) | undefined;
  private readonly restoreHostStorage: ((storage: Record<string, Record<string, unknown>>) => void) | undefined;
  private readonly setTimeoutFn: ((cb: () => void, ms: number) => void) | undefined;
  private readonly sound: Pick<SoundFXService, "prefsSnapshot"> | undefined;
  private readonly log: ((msg: string) => void) | undefined;
  private readonly warn: ((msg: string, err?: unknown) => void) | undefined;
  private saveQueue: Promise<void> | null = null;

  constructor(deps: SaveDeps) {
    this.storage = deps.storage;
    this.voyage = deps.voyage;
    this.getEnabledPlugins = deps.getEnabledPlugins;
    this.getHostStorage = deps.getHostStorage;
    this.restoreHostStorage = deps.restoreHostStorage;
    this.setTimeoutFn = deps.setTimeoutFn;
    this.sound = deps.sound;
    this.log = deps.log;
    this.warn = deps.warn;
  }

  save(): void {
    const payload = this.voyage.serialize();
    const full: PersistedPayload = {
      ...payload,
      version: SAVE_VERSION,
      pluginState: { ...payload.pluginState },
      hostStorage: deepClonePayload(this.getHostStorage?.() ?? {}) as Record<string, Record<string, unknown>>,
      enabledPlugins: [...(this.getEnabledPlugins?.() ?? [])],
    };
    try {
      this.storage.setItem(SaveSystem.STORAGE_KEY, JSON.stringify(full));
      this.log?.("[CONDUIT] Voyage telemetry archived automatically.");
    } catch (e) {
      this.warn?.("Auto-save failed to write:", e);
    }
  }

  /** Restore plugin host storage persisted via getHostStorage on save. */
  applyHostStorage(storage?: Record<string, Record<string, unknown>> | null): void {
    if (!storage || !isRecord(storage)) return;
    const restore = this.restoreHostStorage;
    if (!restore) return;
    const cloned = deepClonePayload(storage) as Record<string, Record<string, unknown>>;
    const out: Record<string, Record<string, unknown>> = {};
    let count = 0;
    for (const [pluginId, bag] of Object.entries(cloned)) {
      if (count >= MAX_PLUGIN_KEYS) break;
      if (typeof pluginId !== "string" || pluginId.length === 0 || !isRecord(bag)) continue;
      out[pluginId] = { ...bag };
      count += 1;
    }
    restore(out);
  }

  /** Async-aware save: defers the write so onSave plugin handlers can settle first. */
  saveAsync(): Promise<void> {
    if (this.saveQueue) return this.saveQueue;
    this.saveQueue = new Promise<void>((resolve) => {
      const done = (): void => {
        try {
          this.save();
        } finally {
          this.saveQueue = null;
          resolve();
        }
      };
      if (this.setTimeoutFn) this.setTimeoutFn(done, 0);
      else setTimeout(done, 0);
    });
    return this.saveQueue;
  }

  load(): PersistedPayload | null {
    try {
      const raw = this.storage.getItem(SaveSystem.STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      const migrated = migrate(parsed);
      if (!migrated) {
        this.warn?.("Auto-save payload has an unsupported shape");
        return null;
      }
      try {
        this.applyHostStorage(migrated.hostStorage);
      } catch (e) {
        this.warn?.("Failed to restore host storage:", e);
      }
      return migrated;
    } catch (e) {
      this.warn?.("Failed to parse auto-save:", e);
      return null;
    }
  }

  saveAudioPrefs(prefs?: AudioPrefs): void {
    const toSave = prefs ?? this.sound?.prefsSnapshot();
    if (!toSave) return;
    try {
      this.storage.setItem(SaveSystem.AUDIO_KEY, JSON.stringify(toSave));
    } catch {
      // Persistent storage unavailable; audio prefs are non-essential.
    }
  }

  loadAudioPrefs(): AudioPrefs | null {
    try {
      const raw = this.storage.getItem(SaveSystem.AUDIO_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AudioPrefs;
    } catch {
      return null;
    }
  }

  clear(): void {
    try {
      this.storage.removeItem(SaveSystem.STORAGE_KEY);
    } catch (e) {
      this.warn?.("Failed to clear auto-save:", e);
    }
  }

  hasSave(): boolean {
    try {
      return !!this.storage.getItem(SaveSystem.STORAGE_KEY);
    } catch {
      return false;
    }
  }
}

export function createSaveSystem(deps: SaveDeps): SaveSystem {
  return new SaveSystem(deps);
}
