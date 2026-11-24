// Sonic Pi web runtime. Programs live as standalone .rb files in ./audio so they can be
// pasted into the Sonic Pi editor and back. The game prepends a level line before running.
// Runtime assets live in public/sonic-pi (`pnpm audio:sonic-pi`).

import railsSource from "./audio/rails.rb?raw";
import telemetrySource from "./audio/telemetry.rb?raw";
import riftDriftSource from "./audio/rift-drift.rb?raw";
import waypointPulseSource from "./audio/waypoint-pulse.rb?raw";
import eventHorizonSource from "./audio/event-horizon.rb?raw";
import sfxSource from "./audio/sfx.rb?raw";
import type { AmbientMode } from "./types";

const BASE = "/sonic-pi/";
const BOOT_TIMEOUT_MS = 20000;
const AMBIENT_GROUP = 1;
const SFX_GROUP = 2;

type Runtime = { version: string; samples: string[] };
type Engine = object;
type Session = {
  run(code: string, opts?: { group?: number }): Promise<number>;
  stopGroup(group: number, fade?: number): void;
};
type Module = {
  loadRuntime(base: string, opts?: { sources?: string[] }): Promise<Runtime>;
  bootEngine(opts?: object, extra?: { runtime?: Runtime }): Promise<Engine>;
  createLiveSession(runtime: Runtime, engine: Engine, handlers: object): Session;
};

export type AmbientKind = AmbientMode;

export function ambientProgram(kind: AmbientKind, amp: number): string | null {
  const sources: Record<AmbientKind, string | null> = {
    rails: railsSource,
    telemetry: telemetrySource,
    "rift-drift": riftDriftSource,
    "waypoint-pulse": waypointPulseSource,
    "event-horizon": eventHorizonSource,
    none: null,
  };
  const source = sources[kind] ?? null;
  if (!source) return null;
  // The .rb files default to 1.0; the game's value wins because the default is guarded.
  return `set :ambient_amp, ${amp}\n${source}`;
}

export const SFX_PROGRAM = sfxSource;

export class SonicPiAudio {
  ready = false;
  error: string | null = null;
  private boot: Promise<Session> | null = null;
  private current: string | null = null;

  async start(): Promise<void> {
    if (this.ready) return;
    try {
      const session = await this.ensureSession();
      await session.run(`set :sfx_amp, 1.0\n${SFX_PROGRAM}`, { group: 3 });
      this.ready = true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      console.warn("Sonic Pi audio unavailable:", this.error);
    }
  }

  // Restart the ambient group with a new program; null means silence.
  async playAmbient(program: string | null): Promise<void> {
    if (!this.ready) return;
    if (program === this.current) return;
    this.current = program;
    const session = await this.ensureSession();
    session.stopGroup(AMBIENT_GROUP, 0.05);
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    if (program && program === this.current) await session.run(program, { group: AMBIENT_GROUP });
  }

  eval(code: string): void {
    if (!this.ready) return;
    void this.boot?.then((session) => session.run(code, { group: SFX_GROUP })).catch(() => {});
  }

  stop(): void {
    void this.boot?.then((session) => session.stopGroup(AMBIENT_GROUP, 0.1)).catch(() => {});
    this.current = null;
    this.ready = false;
  }

  private ensureSession(): Promise<Session> {
    if (!this.boot) {
      const boot = (async () => {
        const app = (await import(/* @vite-ignore */ `${BASE}sonic_pi.js`)) as Module;
        const rt = (await import(/* @vite-ignore */ `${BASE}runtime.js`)) as Module;
        const runtime = await rt.loadRuntime(BASE, { sources: ["white"] });
        const engine = await app.bootEngine({}, { runtime });
        return app.createLiveSession(runtime, engine, {
          error: (e: { message?: string }) => console.warn("Sonic Pi:", e?.message ?? e),
        });
      })();
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(
          () => reject(new Error("Sonic Pi engine boot timed out")),
          BOOT_TIMEOUT_MS,
        );
      });
      this.boot = Promise.race([boot, timeout]);
    }
    return this.boot;
  }
}
