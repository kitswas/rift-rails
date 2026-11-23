import { beforeEach, describe, expect, it, vi } from "vitest";

const sp = vi.hoisted(() => ({
  ready: false,
  start: vi.fn(async () => {}),
  playAmbient: vi.fn(async () => {}),
  eval: vi.fn(),
}));

vi.mock("../src/game/sonicPi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/game/sonicPi")>();
  return {
    ...actual,
    SonicPiAudio: class {
      get ready(): boolean {
        return sp.ready;
      }
      set ready(value: boolean) {
        sp.ready = value;
      }
      start = sp.start;
      playAmbient = sp.playAmbient;
      eval = sp.eval;
    },
  };
});

import { GAME_DATA } from "../src/game/data";
import { SoundFXService } from "../src/game/audio";

const makeSound = (): SoundFXService =>
  new SoundFXService({ config: GAME_DATA.audio, getPhase: () => "IDLE" });

describe("SoundFXService Sonic Pi backend", () => {
  beforeEach(() => {
    sp.ready = false;
    sp.start.mockClear().mockImplementation(async () => {
      sp.ready = true;
    });
    sp.playAmbient.mockClear();
    sp.eval.mockClear();
  });

  it("starts the current ambient program after boot", async () => {
    const sound = makeSound();
    sound.init();
    await vi.waitFor(() => expect(sp.playAmbient).toHaveBeenCalled());
    const calls = sp.playAmbient.mock.calls as unknown as Array<[string | null]>;
    expect(calls[0]?.[0]).toContain("live_loop :rails");
  });

  it("switches ambient programs and can go silent", () => {
    const sound = makeSound();
    sp.ready = true;
    sound.setAmbientMode("telemetry");
    expect(sp.playAmbient).toHaveBeenCalledWith(expect.stringContaining("live_loop :telemetry"));

    sound.setAmbientMode("none");
    expect(sp.playAmbient).toHaveBeenCalledWith(null);
  });

  it("sends one-shot SFX snippets and respects mute", () => {
    const sound = makeSound();
    sound.playActionSuccess();
    expect(sp.eval).toHaveBeenCalledWith(expect.stringContaining("sfx_success()"));

    sp.eval.mockClear();
    sound.toggleMute();
    sound.playActionDamage();
    expect(sp.eval).not.toHaveBeenCalled();
  });
});
