// Plugin manifest (manifest.json inside a plugin zip): shape + validation.

import { HOST_API_VERSION } from "./workerProtocol";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  /** Minimum host API version the plugin requires. */
  minApi: number;
  /** Entry module path inside the zip (must be a .js/.mjs file). */
  entry: string;
  permissions: string[];
}

export class ManifestError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`invalid manifest: ${issues.join("; ")}`);
    this.name = "ManifestError";
    this.issues = issues;
  }
}

export const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const MAX_PATH_CHARS = 256;
const MAX_SEGMENT_CHARS = 128;

export const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set([
  "*",
  "voyage:adjustResource",
  "voyage:executeAction",
  "voyage:explore",
  "voyage:desperate",
  "net:fetch",
]);

/** True when the host API is new enough for the manifest's minApi. */
export function isCompatible(manifest: Pick<PluginManifest, "minApi">): boolean {
  return manifest.minApi <= HOST_API_VERSION;
}

/** True when path stays inside the zip (no traversal, no absolute paths). */
export function isSafeZipPath(p: string): boolean {
  if (typeof p !== "string" || p.length === 0 || p.length > MAX_PATH_CHARS) return false;
  if (/[\x00-\x1F\x7F]/.test(p)) return false;
  if (p.startsWith("/") || p.startsWith("\\") || /^[a-z]:/i.test(p)) return false;
  return p
    .split(/[\\/]/)
    .every((seg) => seg !== ".." && seg !== "." && seg !== "" && seg.length <= MAX_SEGMENT_CHARS);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parse + validate manifest.json contents. Throws ManifestError. */
export function parseManifest(raw: unknown): PluginManifest {
  if (!isRecord(raw)) throw new ManifestError(["manifest must be a JSON object"]);
  const issues: string[] = [];

  const id = raw.id;
  if (typeof id !== "string" || !ID_RE.test(id)) {
    issues.push("id must be 1-64 chars of [a-z0-9_-]");
  }

  const name = raw.name;
  if (typeof name !== "string" || name.trim().length === 0) {
    issues.push("name must be a non-empty string");
  }

  const version = raw.version;
  if (typeof version !== "string" || !VERSION_RE.test(version)) {
    issues.push("version must be semver (x.y.z)");
  }

  const minApi = raw.minApi;
  if (typeof minApi !== "number" || !Number.isInteger(minApi) || minApi < 1) {
    issues.push("minApi must be a positive integer");
  }

  const entry = raw.entry;
  if (
    typeof entry !== "string" ||
    !isSafeZipPath(entry) ||
    !/\.m?js$/i.test(entry)
  ) {
    issues.push("entry must be a safe in-zip .js/.mjs path");
  }

  const permissions = raw.permissions;
  if (!Array.isArray(permissions) || !permissions.every((p) => typeof p === "string")) {
    issues.push("permissions must be an array of strings");
  } else {
    for (const p of permissions) {
      if (!KNOWN_PERMISSIONS.has(p as string)) {
        issues.push(`unknown permission: ${p}`);
      }
    }
  }

  if (issues.length > 0) throw new ManifestError(issues);

  const manifest: PluginManifest = {
    id: id as string,
    name: (name as string).trim(),
    version: version as string,
    minApi: minApi as number,
    entry: entry as string,
    permissions: [...(permissions as string[])],
  };
  if (!isCompatible(manifest)) {
    throw new ManifestError([
      `requires host API >= ${manifest.minApi}, host is ${HOST_API_VERSION}`,
    ]);
  }
  return manifest;
}
