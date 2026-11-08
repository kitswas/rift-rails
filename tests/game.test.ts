import { describe, expect, it } from "vitest";
import { GAME_DATA } from "../src/game/data";
import { VoyageSession } from "../src/game/session";
import {
  CORVUS_FINAL_CUTSCENE,
  DRAG_TAP_THRESHOLD_PX,
  JUMP_CHARGE_MS,
  JUMP_TOTAL_MS,
} from "../src/game/config";

describe("config", () => {
  it("matches GAME_DATA jump timing and Corvus final cutscene", () => {
    expect(JUMP_CHARGE_MS).toBe(GAME_DATA.config.JUMP_CHARGE_MS);
    expect(JUMP_TOTAL_MS).toBe(GAME_DATA.config.JUMP_TOTAL_MS);
    expect(CORVUS_FINAL_CUTSCENE).toBe(GAME_DATA.config.CORVUS_FINAL_CUTSCENE);
    expect(JUMP_CHARGE_MS).toBe(900);
    expect(JUMP_TOTAL_MS).toBe(1250);
    expect(DRAG_TAP_THRESHOLD_PX).toBe(4);
  });
});

describe("cutscene data", () => {
  it("has choiceA and choiceB on all beats", () => {
    let beats = 0;
    for (const cutscene of Object.values(GAME_DATA.cutscenes)) {
      for (const beat of cutscene.beats) {
        beats += 1;
        expect(typeof beat.choiceA).toBe("string");
        expect(typeof beat.choiceB).toBe("string");
      }
    }
    expect(beats).toBe(11);
  });
});

describe("voyage session", () => {
  it("round-trips serialize and loadState without changing hull", () => {
    VoyageSession.resetState();
    const before = VoyageSession.serialize();
    VoyageSession.loadState(JSON.parse(JSON.stringify(before)));
    const after = VoyageSession.serialize();
    expect(after.hull).toBe(before.hull);
    expect(after.seenCutscenes).toEqual(before.seenCutscenes);
  });

  it("marks observer departed after final cutscene", () => {
    VoyageSession.resetState();
    expect(VoyageSession.hasObserverDeparted()).toBe(false);
    VoyageSession.markCutsceneSeen(CORVUS_FINAL_CUTSCENE);
    expect(VoyageSession.hasObserverDeparted()).toBe(true);
    expect(VoyageSession.getSnapshot().seenCutscenes).toContain("wp5");
  });
});
