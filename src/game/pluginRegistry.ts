// Catalog loader for remote plugin registries: fetch -> validate -> resolve
// sources -> verify sha256. Engine/save code stays untouched; every external
// operation is injectable so callers can run fully offline.

import { ID_RE, KNOWN_PERMISSIONS, isCompatible } from "./manifest";

export interface PluginRegistryEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  defaultEnabled: boolean;
  source: string;
  sha256: string;
  minApi: number;
  permissions: string[];
}

export interface PluginRegistry {
  version: 1;
  plugins: PluginRegistryEntry[];
}

export interface RegistryDeps {
  fetchJson?: (url: string) => Promise<unknown>;
  fetchBytes?: (url: string) => Promise<ArrayBuffer>;
  digest?: (buf: ArrayBuffer) => Promise<string>;
}

export interface VerifiedPlugin {
  entry: PluginRegistryEntry;
  bytes: ArrayBuffer;
}

const REGISTRY_VERSION = 1 as const;
const MIN_PLUGINS = 1;
const MAX_PLUGINS = 64;
const MAX_NAME_CHARS = 128;
const MAX_VERSION_CHARS = 64;
const MAX_DESCRIPTION_CHARS = 1024;
const MAX_SOURCE_CHARS = 1024;
const SHA256_RE = /^[0-9a-f]{64}$/;
const MIN_ENTRY_API = 1;
const MAX_REGISTRY_JSON_CHARS = 256 * 1024;
const MAX_PLUGIN_BYTES = 16 * 1024 * 1024;
const HASH_ALGORITHM = "SHA-256";
const FETCH_TIMEOUT_MS = 5000;
const ALLOWED_REGISTRY_KEYS: ReadonlySet<string> = new Set(["version", "plugins"]);
const HTTP_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isBoundedText(v: unknown, maxChars: number): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= maxChars;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((item): item is string => typeof item === "string");
}

function parseEntry(raw: unknown): PluginRegistryEntry | null {
  if (!isRecord(raw)) return null;
  const { id, name, version, description, defaultEnabled, source, sha256, minApi, permissions } =
    raw;
  if (typeof id !== "string" || !ID_RE.test(id)) return null;
  if (!isBoundedText(name, MAX_NAME_CHARS)) return null;
  if (!isBoundedText(version, MAX_VERSION_CHARS)) return null;
  if (!isBoundedText(description, MAX_DESCRIPTION_CHARS)) return null;
  if (typeof defaultEnabled !== "boolean") return null;
  if (!isBoundedText(source, MAX_SOURCE_CHARS)) return null;
  if (typeof sha256 !== "string" || !SHA256_RE.test(sha256)) return null;
  if (typeof minApi !== "number" || !Number.isInteger(minApi) || minApi < MIN_ENTRY_API) {
    return null;
  }
  if (!isStringArray(permissions)) return null;
  if (!permissions.every((p) => KNOWN_PERMISSIONS.has(p))) return null;
  return {
    id,
    name,
    version,
    description,
    defaultEnabled,
    source,
    sha256,
    minApi,
    permissions: [...permissions],
  };
}

/** Strict catalog shape check. Returns null rather than throwing on bad input. */
export function validatePluginRegistry(raw: unknown): PluginRegistry | null {
  if (!isRecord(raw)) return null;
  if (!Object.keys(raw).every((key) => ALLOWED_REGISTRY_KEYS.has(key))) return null;
  if (raw.version !== REGISTRY_VERSION) return null;
  if (!Array.isArray(raw.plugins)) return null;
  const pluginsRaw: unknown[] = raw.plugins;
  if (pluginsRaw.length < MIN_PLUGINS || pluginsRaw.length > MAX_PLUGINS) return null;

  const plugins: PluginRegistryEntry[] = [];
  const ids = new Set<string>();
  for (const rawEntry of pluginsRaw) {
    const entry = parseEntry(rawEntry);
    if (!entry || ids.has(entry.id)) return null;
    ids.add(entry.id);
    plugins.push(entry);
  }
  return { version: REGISTRY_VERSION, plugins };
}

/** True when the host API version satisfies the entry's declared minimum. */
export function isEntryCompatible(entry: PluginRegistryEntry): boolean {
  return isCompatible(entry);
}

function absoluteUrl(url: string): string {
  const base =
    typeof document !== "undefined"
      ? document.baseURI
      : typeof location !== "undefined"
        ? location.href
        : undefined;
  if (!base) return url;
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

/** Resolve a registry-provided source; only app-served http(s) URLs are allowed. */
export function resolveRegistrySource(source: string, registryUrl: string): string {
  let resolved: URL;
  try {
    resolved = new URL(source, absoluteUrl(registryUrl));
  } catch {
    throw new Error(`invalid plugin source: ${source}`);
  }
  if (!HTTP_PROTOCOLS.has(resolved.protocol)) {
    throw new Error(`unsupported plugin source scheme: ${resolved.protocol}`);
  }
  return resolved.href;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching plugin registry`);
  const text = await res.text();
  if (text.length > MAX_REGISTRY_JSON_CHARS) throw new Error("plugin registry too large");
  return JSON.parse(text) as unknown;
}

export async function loadPluginRegistry(
  registryUrl: string,
  deps: RegistryDeps = {},
): Promise<PluginRegistry> {
  const url = absoluteUrl(registryUrl);
  const raw = await (deps.fetchJson ?? defaultFetchJson)(url);
  const registry = validatePluginRegistry(raw);
  if (!registry) throw new Error(`invalid plugin registry: ${url}`);
  return registry;
}

async function defaultFetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching plugin zip`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_PLUGIN_BYTES) throw new Error("plugin zip too large");
  return buf;
}

async function defaultDigest(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest(HASH_ALGORITHM, buf);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Download and verify a registry entry. The caller owns host.loadZip. */
export async function downloadVerifiedPlugin(
  entry: PluginRegistryEntry,
  registryUrl: string,
  deps: RegistryDeps = {},
): Promise<VerifiedPlugin> {
  const url = resolveRegistrySource(entry.source, registryUrl);
  const bytes = await (deps.fetchBytes ?? defaultFetchBytes)(url);
  const digest = await (deps.digest ?? defaultDigest)(bytes);
  if (digest !== entry.sha256) throw new Error(`sha256 mismatch: ${entry.id}`);
  return { entry, bytes };
}
