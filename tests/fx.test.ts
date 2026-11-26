import { describe, expect, it, vi } from "vitest";
import { GAME_DATA } from "../src/game/data";
import { TransitionFXService } from "../src/game/fx";

describe("TransitionFXService reduced motion", () => {
  it("skips motion effects but keeps jump callbacks and timing", () => {
    const timers: { callback: () => void; delay: number }[] = [];
    const requestFrame = vi.fn(() => 1);
    const vibrate = vi.fn();
    const onBreach = vi.fn();
    const onComplete = vi.fn();
    const game = document.createElement("div");
    const bridge = document.createElement("div");
    const canvas = document.createElement("canvas");
    const sound = {
      init: vi.fn(),
      playJumpCharge: vi.fn(),
      playArrivalChime: vi.fn(),
      updateAmbientTheme: vi.fn(),
    };
    const fx = new TransitionFXService({
      config: GAME_DATA.config,
      themes: {
        getTheme: () => undefined,
        getDefaultTheme: () => GAME_DATA.procedural.defaultTheme,
      },
      sound,
      vibrate,
      requestFrame,
      reducedMotion: () => true,
      setTimeoutFn: (callback, delay) => {
        timers.push({ callback, delay });
        return timers.length;
      },
    });
    fx.bindChrome(game, bridge);
    fx.fxEl = canvas;

    fx.playJumpEffect("res", "Red Station", onBreach, onComplete);

    expect(requestFrame).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
    expect(game.className).toBe("");
    expect(bridge.className).toBe("");
    expect(canvas.className).toBe("");
    expect(timers.map(({ delay }) => delay)).toEqual([
      GAME_DATA.config.JUMP_CHARGE_MS,
      GAME_DATA.config.JUMP_TOTAL_MS,
    ]);

    timers[0]?.callback();
    expect(onBreach).toHaveBeenCalledOnce();
    expect(sound.playArrivalChime).toHaveBeenCalledOnce();
    timers[1]?.callback();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(game.className).toBe("");
    expect(bridge.className).toBe("");
    expect(canvas.className).toBe("");
  });

  it("invalidates pending jump callbacks when a jump is cancelled", () => {
    const timers: (() => void)[] = [];
    const onBreach = vi.fn();
    const onComplete = vi.fn();
    const game = document.createElement("div");
    const bridge = document.createElement("div");
    const canvas = document.createElement("canvas");
    const cancelFrame = vi.fn();
    const fx = new TransitionFXService({
      config: GAME_DATA.config,
      themes: {
        getTheme: () => undefined,
        getDefaultTheme: () => GAME_DATA.procedural.defaultTheme,
      },
      sound: {
        init: vi.fn(),
        playJumpCharge: vi.fn(),
        playArrivalChime: vi.fn(),
        updateAmbientTheme: vi.fn(),
      },
      requestFrame: () => 1,
      cancelFrame,
      setTimeoutFn: (callback) => {
        timers.push(callback);
        return timers.length;
      },
    });
    fx.bindChrome(game, bridge);
    fx.fxEl = canvas;

    fx.playJumpEffect("res", "Red Station", onBreach, onComplete);
    fx.cancelJumpEffect();
    timers.forEach((callback) => callback());

    expect(cancelFrame).toHaveBeenCalledOnce();
    expect(onBreach).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(game.className).toBe("");
    expect(bridge.className).toBe("");
    expect(canvas.className).toBe("");
    expect(fx.running).toBe(false);
  });
});
