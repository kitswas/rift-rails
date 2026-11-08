// @ts-nocheck -- legacy module extracted verbatim; remove per-module as types land.
// Extracted verbatim from index.html during TS migration.
import { GAME_DATA } from "./data";
export const ConduitDeck: any = {
  sectorBag: [],

  init: (savedBag = null) => {
    if (savedBag && Array.isArray(savedBag) && savedBag.length > 0) {
      ConduitDeck.sectorBag = [...savedBag];
    } else {
      ConduitDeck.sectorBag = ConduitDeck.createShuffledSectorBag();
    }
  },

  shuffleArray: (arr) => arr.sort(() => Math.random() - 0.5),

  createShuffledSectorBag: () => {
    const bag = [];
    for (const [nodeType, count] of Object.entries(GAME_DATA.sectorPoolCounts)) {
      for (let i = 0; i < count; i++) bag.push(nodeType);
    }
    return ConduitDeck.shuffleArray(bag);
  },

  resolveNextNodeId: (jumpCount, pop = false) => {
    const nextJump = jumpCount + 1;
    if (nextJump <= GAME_DATA.runway.length) {
      return GAME_DATA.runway[nextJump - 1];
    }
    if (nextJump % GAME_DATA.config.WAYPOINT_HUB_INTERVAL === 0) {
      return "hub";
    }
    if (!ConduitDeck.sectorBag || ConduitDeck.sectorBag.length === 0) {
      ConduitDeck.sectorBag = ConduitDeck.createShuffledSectorBag();
    }
    return pop
      ? ConduitDeck.sectorBag.pop()
      : ConduitDeck.sectorBag[ConduitDeck.sectorBag.length - 1];
  },

  generateDimensionForId: (chosenId) => {
    const adj =
      GAME_DATA.procedural.adjectives[
        Math.floor(Math.random() * GAME_DATA.procedural.adjectives.length)
      ];
    const nouns = GAME_DATA.procedural.nouns[chosenId];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return { id: chosenId, name: `${adj} ${noun}` };
  },

  getTrajectories: (jumpCount, hasAstrolabe) => {
    const nextJump = jumpCount + 1;
    const isFixedPoint =
      nextJump <= GAME_DATA.runway.length ||
      nextJump % GAME_DATA.config.WAYPOINT_HUB_INTERVAL === 0;

    if (!hasAstrolabe) {
      const chosenId = ConduitDeck.resolveNextNodeId(jumpCount, true);
      const dest = ConduitDeck.generateDimensionForId(chosenId);
      return [{ ...dest, returnId: null }];
    }

    let id1, id2;
    if (isFixedPoint) {
      id1 = ConduitDeck.resolveNextNodeId(jumpCount, true);
      id2 = id1;
    } else {
      id1 = ConduitDeck.resolveNextNodeId(jumpCount, true);
      id2 = ConduitDeck.resolveNextNodeId(jumpCount, true);
    }

    const dest1 = ConduitDeck.generateDimensionForId(id1);
    const dest2 = ConduitDeck.generateDimensionForId(id2);

    return [
      { ...dest1, returnId: isFixedPoint ? null : id2 },
      { ...dest2, returnId: isFixedPoint ? null : id1 },
    ];
  },

  commitTrajectory: (choice) => {
    if (choice.returnId && ConduitDeck.sectorBag) {
      ConduitDeck.sectorBag.push(choice.returnId);
      ConduitDeck.shuffleArray(ConduitDeck.sectorBag);
    }
    return { dimId: choice.id, dimName: choice.name };
  },

  serialize: () => ConduitDeck.sectorBag || [],
};
/* ========================================================
         HEADACHE-FREE PROCEDURAL ACOUSTIC ENGINE (2 MODES)
         ======================================================== */
