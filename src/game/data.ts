// @ts-nocheck -- legacy module extracted verbatim; remove per-module as types land.
// Extracted verbatim from index.html during TS migration.
export const GAME_DATA: any = {
  config: {
    MAX_HULL: 100,
    START_FUEL: 50,
    START_ENERGY: 2,
    MAX_TIER: 3,
    DEATH_HULL_THRESHOLD: 0,
    CRITICAL_HULL_THRESHOLD: 30,
    STRANDED_HULL_THRESHOLD: 15,
    MIN_FLUX_TO_BUY_FUEL: 20,
    NAV_CHOICES_COUNT: 2,

    TRAVEL_BASE_FUEL_COST: 15,
    TRAVEL_TIER_MULT: 10,
    FORGE_BASE_FLUX_COST: 75,
    DESPERATE_HULL_COST: 10,
    DESPERATE_FUEL_YIELD: 20,

    EXO_DMG_MULT: 0.7,
    GREENHOUSE_FUEL_YIELD: 8,
    GOBLIN_HULL_YIELD: 5,
    ORC_WPN_BONUS: 1,

    HUNT_WPN_MULT: 0.2,

    HUNT_SOLITARY_ENERGY: 1,
    HUNT_SOLITARY_WIN_RATE: 0.6,
    HUNT_SOLITARY_FLUX: 30,
    HUNT_SOLITARY_FUEL: 15,
    HUNT_SOLITARY_HULL_DMG: 20,

    HUNT_PACK_ENERGY: 2,
    HUNT_PACK_WIN_RATE: 0.5,
    HUNT_PACK_FLUX: 60,

    HUNT_DEEP_ENERGY: 3,
    HUNT_DEEP_WIN_RATE: 0.3,
    HUNT_DEEP_FLUX: 90,
    HUNT_DEEP_FUEL: 25,
    HUNT_DEEP_HULL_DMG: 40,
    HUNT_DEEP_WPN_REQ: 2,

    RES_SIPHON_ENERGY: 1,
    RES_SIPHON_FUEL: 25,
    RES_HARVEST_ENERGY: 1,
    RES_HARVEST_FLUX: 30,
    RES_DRILL_ENERGY: 2,
    RES_DRILL_HULL_DMG: 15,
    RES_DRILL_FLUX: 60,

    MAZE_BLAST_ENERGY: 1,
    MAZE_BLAST_BASE_DMG: 30,
    MAZE_BLAST_TIER_REDUC: 5,
    MAZE_BLAST_FLUX: 40,
    MAZE_MAP_ENERGY: 1,
    MAZE_MAP_FUEL_YIELD: 30,
    MAZE_MAP_FLUX_YIELD: 50,

    HUB_REST_FLUX_COST: 20,
    HUB_REST_HULL_YIELD: 30,

    HUB_FUEL_BASE_COST: 20,
    HUB_FUEL_TIER_COST: 10,
    HUB_FUEL_JUMPS_RESTORED: 2,

    HUB_EASY_FUEL_COST: 10,
    HUB_EASY_FLUX_YIELD: 35,
    HUB_EASY_REP_YIELD: 1,
    HUB_HARD_REP_REQ: 2,
    HUB_HARD_FUEL_COST: 25,
    HUB_HARD_FLUX_YIELD: 100,

    WAYPOINT_HUB_INTERVAL: 10,

    JUMP_CHARGE_MS: 900,
    JUMP_TOTAL_MS: 1250,
    // Waypoint cutscene after which Master Corvus has disembarked.
    CORVUS_FINAL_CUTSCENE: "wp5",
    FX_STAR_COUNT: 220,
    FX_VIBRATE_PATTERN: [35, 45, 100],
  },

  audio: {
    chargeRumbleStartFreq: 55,
    chargeRumbleEndFreq: 360,
    chargeBandpassStartFreq: 200,
    chargeBandpassEndFreq: 3600,
    chargeBandpassQ: 4,
    chargeWhistleStartFreq: 220,
    chargeWhistleEndFreq: 1300,
    chimeNoteStart: 587.33,
    chimeNoteEnd: 880,
    dialogueChimeFreq: 523.25,
    LOG_AUDIO_EXPONENT: 2.0,
  },

  runway: ["hub", "res", "res", "hunt", "hub"],
  sectorPoolCounts: { res: 3, hunt: 3, maze: 3 },

  resources: {
    hull: "Hull",
    fuel: "Fuel",
    energy: "EN",
    flux: "Flux",
    rep: "Rep",
    engineTier: "Eng Tier",
    weaponTier: "Wpn Tier",
    module: "module",
    carriage: "carriage",
    crew: "crew",
  },

  phases: {
    start: "START",
    idle: "IDLE",
    dialogue: "DIALOGUE",
    encounter: "ENCOUNTER",
    navigating: "NAVIGATING",
    jumping: "JUMPING",
    dead: "DEAD",
    stranded: "STRANDED",
    yard_root: "YARD_ROOT",
    yard_category: "YARD_CATEGORY",
  },

  transitions: {
    START: ["IDLE", "DIALOGUE"],
    IDLE: ["DIALOGUE", "ENCOUNTER", "NAVIGATING", "JUMPING", "DEAD", "STRANDED", "IDLE"],
    DIALOGUE: ["IDLE", "DEAD", "STRANDED"],
    ENCOUNTER: ["IDLE", "DIALOGUE", "YARD_ROOT", "DEAD", "STRANDED", "NAVIGATING", "JUMPING"],
    YARD_ROOT: ["YARD_CATEGORY", "ENCOUNTER"],
    YARD_CATEGORY: ["YARD_ROOT"],
    NAVIGATING: ["JUMPING", "IDLE", "DEAD", "STRANDED"],
    JUMPING: ["IDLE", "DIALOGUE", "DEAD", "STRANDED"],
    DEAD: [],
    STRANDED: [],
  },

  permissions: {
    START: { explore: false, travel: false, forge: false },
    IDLE: { explore: true, travel: true, forge: true },
    DIALOGUE: { explore: false, travel: false, forge: false },
    ENCOUNTER: { explore: false, travel: true, forge: true },
    YARD_ROOT: { explore: false, travel: false, forge: false },
    YARD_CATEGORY: { explore: false, travel: false, forge: false },
    NAVIGATING: { explore: false, travel: false, forge: false },
    JUMPING: { explore: false, travel: false, forge: false },
    DEAD: { explore: false, travel: false, forge: false },
    STRANDED: { explore: false, travel: false, forge: false },
  },

  dom: {
    classes: {
      logEntry: "log-entry",
      logSystem: "log-system",
      logHelp: "log-help",
      logEvent: "log-event",
      logSuccess: "log-success",
      logDamage: "log-damage",
      logLore: "log-lore",
      lockedUI: "locked-ui",
      btnEnergy: "btn-energy",
      btnSuccess: "btn-success",
      btnAction: "btn-action",
      btnTravel: "btn-travel",
      btnDesperate: "btn-desperate",
      btnNewGame: "btn-new-game",
      navBtn: "nav-btn",
      dimName: "dim-name",
      dimType: "dim-type",
      screenShake: "screen-shake",
      chromaticFlash: "chromatic-flash",
      fxActive: "active",
      tutorialHighlight: "tutorial-highlight",
    },
    ids: {
      startScreen: "start-screen",
      navScreen: "nav-screen",
      navChoices: "nav-choices",
      lblNavTitle: "lbl-nav-title",
      gameContainer: "game-container",
      bridgeScene: "bridge-scene",
      tutorialCue: "tutorial-cue",
      storyLog: "story-log",
      cutsceneOverlay: "cutscene-overlay",
      cutsceneProgress: "cutscene-progress",
      cutsceneBody: "cutscene-body",
      cutsceneChoices: "cutscene-choices",
      cutsceneBtnA: "cutscene-btn-a",
      cutsceneBtnB: "cutscene-btn-b",
      locationName: "location-name",
      locationType: "location-type",
      corvusPortrait: "corvus-portrait",
      encounterChoices: "encounter-choices",
      statHull: "stat-hull",
      statFuel: "stat-fuel",
      statEnergy: "stat-energy",
      statFlux: "stat-flux",
      statRep: "stat-rep",
      statSector: "stat-sector",
      eqEngine: "equip-engine",
      eqWeapon: "equip-weapon",
      eqModule: "equip-module",
      eqCarriage: "equip-carriage",
      eqCrew: "equip-crew",
      btnExplore: "btn-explore",
      btnTravel: "btn-travel",
      btnDesperate: "btn-desperate",
      btnIgnite: "btn-ignite",
      btnStartFresh: "btn-start-fresh",
      btnResetSave: "btn-reset-save",
      btnForgeEng: "btn-forge-engine",
      btnForgeWpn: "btn-forge-weapon",
      lblForge: "lbl-forge",
      rightPanel: "right-panel",
      snapSlider: "snap-slider",
      paneSettings: "pane-settings",
      paneSensors: "pane-sensors",
      paneBridge: "pane-bridge",
      paneForge: "pane-forge",
      paneManual: "pane-manual",
      tabSettings: "tab-settings",
      tabSensors: "tab-sensors",
      tabBridge: "tab-bridge",
      tabForge: "tab-forge",
      tabManual: "tab-manual",
      dimTypeCodex: "dim-type-codex",
      artDisplay: "art-display",
      artLabel: "art-label",
      artGlyph: "art-glyph",
      fxCanvas: "fx-canvas",
      selectAmbientMode: "select-ambient-mode",
      sliderAmbientVol: "slider-ambient-vol",
      sliderSfxVol: "slider-sfx-vol",
      lblAmbientVol: "lbl-ambient-vol",
      lblSfxVol: "lbl-sfx-vol",
      btnToggleMute: "btn-toggle-mute",
    },
  },

  cutscenes: {
    wp1: {
      id: "wp1",
      beats: [
        {
          text: "The Crucible fire drinks refined fuel, Conductor. Mind the draft gauges, or the cold between realms will breach the iron ribs before nightfall.",
          choiceA: "I know how to tend a mystic furnace, Scholar.",
          choiceB: "The wards will hold against the cold.",
        },
        {
          text: "Hardly inspiring. Expend a spark of your locomotive's Energy to unlatch the station gates and survey the merchant yard. We need provisions before we breach the veil again.",
          choiceA: "I will see what the scavengers are selling.",
          choiceB: "Unlatching the gates now.",
        },
        {
          text: "Do make haste. And remember: when the locomotive's local Energy runs dry, only a Rift Jump into the void will rekindle your reserves.",
          choiceA: "Understood. The engine is primed.",
          choiceB: "I'll keep the boiler fed.",
        },
      ],
      logSummary: "Corvus adjusted his veil and demanded the gates be unlatched.",
    },
    wp2: {
      id: "wp2",
      beats: [
        {
          text: "Smell that sulfurous stench? The air is thick with raw ether and condensed Flux. A novice burns out their boiler trying to harvest everything at once.",
          choiceA: "We need fuel for the next jump more than shiny dust.",
          choiceB: "Flux is worth a fortune to the blacksmiths.",
        },
        {
          text: "Ignorance is rampant in this cab. Siphon the volatile gases to fill our propulsion tanks, or harvest the rift crystals to line your pockets with Flux for the forge. Never leave a node without replenishing our stores.",
          choiceA: "Starting the siphoning pumps.",
          choiceB: "Securing the mineral harvesters.",
        },
      ],
      logSummary: "Corvus warned against greed while gathering unrefined rift-matter.",
    },
    wp3: {
      id: "wp3",
      beats: [
        {
          text: "Listen to that rattling rod. If you expect this locomotive to carry us through deeper realms, you would do well to visit the Workshop.",
          choiceA: "The Aethelgard has held together this far.",
          choiceB: "I can hammer extra plating onto the hull.",
        },
        {
          text: "Primitive thinking. Transmuting the Crucible engine grants you greater Energy capacity per realm, but the added bulk demands a heavier toll of fuel for every rift breach. Mutate your ballistas if you wish to survive the hunting expanses.",
          choiceA: "I'll balance the boiler and weapons carefully.",
          choiceB: "We will forge what we can afford.",
        },
      ],
      logSummary: "Corvus grumbled about boiler stress and the Workshop anvil.",
    },
    wp4: {
      id: "wp4",
      beats: [
        {
          text: "Shadows stirring beyond the glass. Voidbeasts have nested along the iron tracks. They thirst for the furnace glow.",
          choiceA: "Man the harpoons. We fight.",
          choiceB: "Can we douse the furnace and drift past?",
        },
        {
          text: "Do not speak of stealth to a predator of the deep void. If you strike them down, their glowing heart-crystals will feed both your fuel tanks and your coin pouch. Hesitate, and their talons will shred the outer hull.",
          choiceA: "Rally the stokers. Ready weapons.",
          choiceB: "Targeting the alphas.",
        },
      ],
      logSummary: "Corvus prepared his talismans as voidbeasts surrounded the train.",
    },
    wp5: {
      id: "wp5",
      beats: [
        {
          text: "The spires of the Sanctuary. My ticket is stamped, and my business with this soot-stained cab is concluded.",
          choiceA: "Safe travels into the Sanctuary, Corvus.",
          choiceB: "Good riddance to an unhelpful passenger.",
        },
        {
          text: "Take this final counsel, Conductor, for the void beyond this hub has no mercy for the blind: visit the Yard Master and buy an Astrolabe before you depart. Without it, you cannot steer when the Ley-Rails fork, and you will drift helpless into whatever nightmare lies ahead. May the wards endure.",
          choiceA: "I will find the Yard Master immediately.",
          choiceB: "The Astrolabe will be mounted.",
        },
      ],
      logSummary:
        "Master Corvus disembarked at the Sanctuary, leaving final counsel to procure an Astrolabe.",
    },
  },

  text: {
    initLog: "The Crucible Engine hums to life. The Ley-Rails stretch into infinity.",
    lblForge: "Crucible Mutations (Workshop)",
    lblNavTitle: "Select Dimensional Trajectory",
    btnIgnite: "Ignite the Crucible Engine",
    btnNewGame: "New Game",
    noneState: "None",
    formatTier: (val) => `Tier ${val}`,
    formatPct: (val) => `${val}%`,
    formatStatPair: (val, max) => `${val} / ${max}`,
    formatDimName: (name) => `Realm: The ${name}`,
    formatDimType: (type) => `Type: ${type}`,
    formatSectorWaypoint: (jump) => `Waypoint ${jump}`,
    exploreName: (isHub) => (isHub ? "Open Docking Bay" : "Survey Realm"),
    btnExploreClosed: (cost) => `${GAME_DATA.text.exploreName(false)} (-${cost} EN)`,
    btnExploreHub: (cost) => `${GAME_DATA.text.exploreName(true)} (-${cost} EN)`,
    tutorialExplore: (isHub, cost) =>
      `Next: ${GAME_DATA.text.exploreName(isHub)} · Costs ${cost} Energy`,
    formatCutsceneProgress: (beat, total) => `Beat ${beat} of ${total}`,
    btnJump: (cost) => `Rift Jump (-${cost} Fuel)`,
    btnDesperate: (cost, yieldAmount) =>
      `Strip Plating for Fuel (-${cost}% Hull, +${yieldAmount} Fuel)`,
    btnForgeEngine: (cost, tierMult, nextJumpCost, curFuel) => {
      let label = `Mutate Engine (${cost} Flux)\n[+1 Max EN, +${tierMult} Jump Cost]`;
      if (curFuel < nextJumpCost) {
        label += `\n[LOW FUEL WARNING: Jump will cost ${nextJumpCost}]`;
      }
      return label;
    },
    btnForgeWeapon: (cost) => `Mutate Weapon (${cost} Flux)\n[+20% Combat Win Odds]`,
    btnApexEngine: "Apex Engine (Max Tier)",
    btnApexWeapon: "Apex Weapon (Max Tier)",

    btnYardModules: "Browse Modules",
    btnYardCarriages: "Browse Carriages",
    btnYardCrew: "Browse Crew",
    btnYardLeave: "Leave Train Yard",
    btnYardBack: "Back to Categories",
    yardItemLabelMenu: (name, desc, cost) => `${name} - ${cost} Flux\n(${desc})`,
    yardReplaceWarning: (currentEq) => `[WARNING: Replaces ${currentEq}]`,
    yardOwned: `[ALREADY INSTALLED]`,
    logYardPurchase: (name) => `Procured and mounted: ${name}.`,

    logLocEnter: (name, label, jump) =>
      `Rift Jump #${jump} complete. Arrived at The ${name}: ${label}`,
    logEncounterTitle: (label, desc) => `<b>${label}:</b> ${desc}`,
    logGreenhouse: (yieldAmount) => `Greenhouse alchemical beds generated +${yieldAmount} Fuel.`,
    logGoblin: (yieldAmount) => `Goblin Engineer repaired +${yieldAmount}% Hull structure.`,
    logDesperate: "DESPERATE MEASURE: Sacrificed hull plates to feed the Crucible.",
    logDead: "CRITICAL BREACH. The train is destroyed. Refresh to restart.",
    logStranded:
      "STRANDED IN VOID. Zero fuel, depleted hull reserves, engine dead. Refresh to re-initialize.",
    logInsuffEnergy: "Insufficient Energy to perform this action.",
    formatActionBtn: (label, costStrs, prodStrs, reqStrs = []) => {
      const costs = costStrs.length ? `-${costStrs.join(", -")}` : "";
      const prods = prodStrs.length ? `+${prodStrs.join(", +")}` : "";
      const reqs = reqStrs.length ? ` [${reqStrs.join(", ")}]` : "";
      const contents = [costs, prods].filter(Boolean).join(", ");
      const mainText = contents ? `${label} (${contents})` : label;
      return reqs ? `${mainText}${reqs}` : mainText;
    },
    formatResVal: (val, resName) => `${val} ${resName}`,
    formatChance: (pct) => `${pct}% Win Odds`,
  },

  glossary: {
    hull: "HULL: Structural armor. Drops from hazardous drilling or failed combat. Reaching 0% destroys the train.",
    fuel: "FUEL: Inter-realm travel reserve. Required to initiate Rift Jumps. Does not auto-recharge.",
    energy:
      "ENERGY: Turn-based local action points. Used to Survey and perform actions. Resets to full on every jump.",
    flux: "FLUX: Catalytic currency. Procured from resource nodes and hunts. Spends on Workshop train mutations.",
    sector: "SECTOR: Realm Waypoint counter. Major Outposts arrive at every 10th jump.",
    rep: "REPUTATION: Station standing. Gained via Hub courier deliveries to unlock lucrative VIP contracts.",
    node: "SECTOR NODE: Classification dictates what resources, threats, or facilities are present.",
    engine: "ENGINE: Crucible core determining locomotive Max Energy and jump fuel expenditure.",
    weapon:
      "WEAPON: Train armaments increasing combat win odds against voidbeasts and apex titans.",
    module: "MODULE: Auxiliary installations providing specialized exploration and survival perks.",
    carriage: "CARRIAGE: Train cars providing passive inter-dimensional resource generation.",
    crew: "CREW: Specialist personnel providing passive repairs or combat bonuses.",
  },

  procedural: {
    adjectives: [
      "Crimson",
      "Fractured",
      "Clockwork",
      "Overgrown",
      "Frozen",
      "Neon",
      "Shattered",
      "Eldritch",
      "Rusting",
    ],
    nouns: {
      hub: ["Station", "Bazaar", "Outpost", "Nexus", "Sanctuary"],
      hunt: ["Wilds", "Expanse", "Tundra", "Jungle", "Dominion"],
      res: ["Wastes", "Quarry", "Nebula", "Crags", "Fields"],
      maze: ["Catacombs", "Labyrinth", "Spire", "Ruins", "Abyss"],
    },
    themes: {
      Crimson: {
        primary: "#e32649",
        secondary: "#ff6f41",
        glyph: "♨",
        bg: "#120407",
      },
      Fractured: {
        primary: "#73acce",
        secondary: "#f0f3ff",
        glyph: "✴",
        bg: "#080a0f",
      },
      Clockwork: {
        primary: "#de9314",
        secondary: "#fdc63c",
        glyph: "⚙",
        bg: "#120d04",
      },
      Overgrown: {
        primary: "#26b068",
        secondary: "#85d964",
        glyph: "❦",
        bg: "#031109",
      },
      Frozen: {
        primary: "#38acd8",
        secondary: "#b9ddfe",
        glyph: "❄",
        bg: "#030c14",
      },
      Neon: {
        primary: "#f6338d",
        secondary: "#04deea",
        glyph: "❖",
        bg: "#0a0317",
      },
      Shattered: {
        primary: "#9885d0",
        secondary: "#dfa4cc",
        glyph: "✸",
        bg: "#0b0813",
      },
      Eldritch: {
        primary: "#9341df",
        secondary: "#6ee7b7",
        glyph: "🜏",
        bg: "#0a0314",
      },
      Rusting: {
        primary: "#cf5b20",
        secondary: "#f6954b",
        glyph: "☵",
        bg: "#120804",
      },
    },
    defaultTheme: {
      primary: "#73acce",
      secondary: "#f0f3ff",
      glyph: "𖣠",
      bg: "#080a0f",
    },
  },

  nodes: {
    hub: {
      id: "hub",
      label: "Mission Hub",
      desc: "A fortified neutral trading depot. Open docking bay to trade or recruit.",
      exploreCost: 1,
      isHub: true,
      actions: ["hub_yard", "hub_rest", "hub_fuel", "hub_quest_easy", "hub_quest_hard"],
    },
    hunt: {
      id: "hunt",
      label: "Hunting Grounds",
      desc: "Spotted movement in the mist. Voidbeasts have nested near the rails.",
      exploreCost: 1,
      isHub: false,
      actions: ["hunt_solitary", "hunt_pack", "hunt_deep"],
    },
    res: {
      id: "res",
      label: "Resource Node",
      desc: "Volatile vapors and concentrated flux seams detected in the rock crust.",
      exploreCost: 1,
      isHub: false,
      actions: ["res_siphon", "res_harvest", "res_drill"],
    },
    maze: {
      id: "maze",
      label: "Derelict Anomaly",
      desc: "Ancient carriages and spatial tears detected. High risk, rich salvage.",
      exploreCost: 1,
      isHub: false,
      actions: ["maze_blast", "maze_map_fuel", "maze_map_flux"],
    },
  },

  yard: {
    astro: {
      name: "Astrolabe",
      type: "module",
      cost: 50,
      desc: "Enables dimensional route selection when the Ley-Rails fork during Rift Jumps.",
    },
    exo: {
      name: "Exoplating",
      type: "module",
      cost: 120,
      desc: "Permanently reduces all hull damage taken by 30%.",
    },
    map: {
      name: "Dimensional Map",
      type: "module",
      cost: 150,
      desc: "Unlocks zero-damage extraction protocols in Derelict Anomalies.",
    },
    green: {
      name: "Greenhouse",
      type: "carriage",
      cost: 180,
      desc: "Passively generates Fuel after every Rift Jump.",
    },
    orc: {
      name: "Orc Gunner",
      type: "crew",
      cost: 200,
      desc: "Functions as a permanent +1 to your Weapon Tier.",
    },
    goblin: {
      name: "Goblin Engineer",
      type: "crew",
      cost: 220,
      desc: "Passively repairs the Hull slightly after every Rift Jump.",
    },
  },
};

export const calcEffectiveWeaponTier: any = (s, c) =>
  s.weaponTier + (s.crew === GAME_DATA.yard.orc.name ? c.ORC_WPN_BONUS : 0);

GAME_DATA.actions = {
  hub_yard: {
    label: "Visit Train Yard",
    uiClass: GAME_DATA.dom.classes.btnEnergy,
    isMenu: true,
    menuTarget: GAME_DATA.phases.yard_root,
    requires: {},
    consumes: [],
    produces: [],
  },
  res_siphon: {
    label: "Siphon Gases",
    uiClass: GAME_DATA.dom.classes.btnEnergy,
    requires: {},
    consumes: [{ res: "energy", amount: (s, c) => c.RES_SIPHON_ENERGY }],
    produces: [{ res: "fuel", amount: (s, c) => c.RES_SIPHON_FUEL }],
    logSuccess: "Siphoned volatile surface vapors into Crucible fuel.",
  },
  res_harvest: {
    label: "Safe Harvest",
    uiClass: GAME_DATA.dom.classes.btnEnergy,
    requires: {},
    consumes: [{ res: "energy", amount: (s, c) => c.RES_HARVEST_ENERGY }],
    produces: [{ res: "flux", amount: (s, c) => c.RES_HARVEST_FLUX }],
    logSuccess: "Harvested local rift anomalies for Dimensional Flux.",
  },
  res_drill: {
    label: "Deep Drill",
    uiClass: GAME_DATA.dom.classes.btnEnergy,
    requires: {},
    consumes: [
      { res: "energy", amount: (s, c) => c.RES_DRILL_ENERGY },
      { res: "hull", amount: (s, c) => c.RES_DRILL_HULL_DMG },
    ],
    produces: [{ res: "flux", amount: (s, c) => c.RES_DRILL_FLUX }],
    logSuccess: "Drilling cracked hull armor, but yielded rich Flux seams.",
  },
  maze_blast: {
    label: "Forced Passage",
    uiClass: GAME_DATA.dom.classes.btnEnergy,
    requires: {},
    consumes: [
      { res: "energy", amount: (s, c) => c.MAZE_BLAST_ENERGY },
      {
        res: "hull",
        amount: (s, c) =>
          Math.max(0, c.MAZE_BLAST_BASE_DMG - s.engineTier * c.MAZE_BLAST_TIER_REDUC),
      },
    ],
    produces: [{ res: "flux", amount: (s, c) => c.MAZE_BLAST_FLUX }],
    logSuccess: "Blasted through spatial wreckage, incurring minor hull stress.",
  },
  maze_map_fuel: {
    label: "Extract Core [Map]",
    uiClass: GAME_DATA.dom.classes.btnSuccess,
    requires: { module: GAME_DATA.yard.map.name },
    consumes: [{ res: "energy", amount: (s, c) => c.MAZE_MAP_ENERGY }],
    produces: [{ res: "fuel", amount: (s, c) => c.MAZE_MAP_FUEL_YIELD }],
    logSuccess: "Dimensional Map bypassed hazards to salvage an intact Power Core.",
  },
  maze_map_flux: {
    label: "Extract Artifact [Map]",
    uiClass: GAME_DATA.dom.classes.btnSuccess,
    requires: { module: GAME_DATA.yard.map.name },
    consumes: [{ res: "energy", amount: (s, c) => c.MAZE_MAP_ENERGY }],
    produces: [{ res: "flux", amount: (s, c) => c.MAZE_MAP_FLUX_YIELD }],
    logSuccess: "Dimensional Map revealed a safe path to extract an Eldritch Artifact.",
  },
  hunt_solitary: {
    label: "Engage Solitary Beast",
    uiClass: GAME_DATA.dom.classes.btnEnergy,
    requires: {},
    probability: (s, c) =>
      c.HUNT_SOLITARY_WIN_RATE + calcEffectiveWeaponTier(s, c) * c.HUNT_WPN_MULT,
    consumes: [{ res: "energy", amount: (s, c) => c.HUNT_SOLITARY_ENERGY }],
    produces: [
      { res: "flux", amount: (s, c) => c.HUNT_SOLITARY_FLUX },
      { res: "fuel", amount: (s, c) => c.HUNT_SOLITARY_FUEL },
    ],
    failConsumes: [{ res: "hull", amount: (s, c) => c.HUNT_SOLITARY_HULL_DMG }],
    logSuccess: "The voidbeast fell! Harvested its radiant Energy Crystal for Fuel and Flux.",
    logFail: "The beast breached your defenses! Took Hull damage.",
  },
  hunt_pack: {
    label: "Ambush Wild Pack",
    uiClass: GAME_DATA.dom.classes.btnEnergy,
    requires: {},
    probability: (s, c) => c.HUNT_PACK_WIN_RATE + calcEffectiveWeaponTier(s, c) * c.HUNT_WPN_MULT,
    consumes: [{ res: "energy", amount: (s, c) => c.HUNT_PACK_ENERGY }],
    produces: [{ res: "flux", amount: (s, c) => c.HUNT_PACK_FLUX }],
    logSuccess: "Scattered the pack and harvested valuable hides and pelts for Flux.",
    logFail:
      "The pack overwhelmed your targeting, but you sealed the doors in time without taking hull damage.",
  },
  hunt_deep: {
    label: "Apex Titan Raid",
    uiClass: GAME_DATA.dom.classes.btnEnergy,
    requires: { weaponTier: GAME_DATA.config.HUNT_DEEP_WPN_REQ },
    probability: (s, c) => c.HUNT_DEEP_WIN_RATE + calcEffectiveWeaponTier(s, c) * c.HUNT_WPN_MULT,
    consumes: [{ res: "energy", amount: (s, c) => c.HUNT_DEEP_ENERGY }],
    produces: [
      { res: "flux", amount: (s, c) => c.HUNT_DEEP_FLUX },
      { res: "fuel", amount: (s, c) => c.HUNT_DEEP_FUEL },
    ],
    failConsumes: [{ res: "hull", amount: (s, c) => c.HUNT_DEEP_HULL_DMG }],
    logSuccess: "An apex titan falls! Harvested massive Flux and rich biofuel core.",
    logFail: "Apex entity crushed outer bulkheads! Heavy structural damage sustained.",
  },
  hub_rest: {
    label: "Dockyard Repairs",
    requires: {},
    consumes: [{ res: "flux", amount: (s, c) => c.HUB_REST_FLUX_COST }],
    produces: [{ res: "hull", amount: (s, c) => c.HUB_REST_HULL_YIELD }],
    logSuccess: "Depot blacksmiths patched armor and repaired your Hull.",
  },
  hub_fuel: {
    label: "Refuel Canisters",
    requires: {},
    consumes: [
      {
        res: "flux",
        amount: (s, c) => c.HUB_FUEL_BASE_COST + s.engineTier * c.HUB_FUEL_TIER_COST,
      },
    ],
    produces: [
      {
        res: "fuel",
        amount: (s, c) =>
          (c.TRAVEL_BASE_FUEL_COST + s.engineTier * c.TRAVEL_TIER_MULT) * c.HUB_FUEL_JUMPS_RESTORED,
      },
    ],
    logSuccess: "Purchased engine-calibrated Fuel canisters.",
  },
  hub_quest_easy: {
    label: "Supply Delivery",
    requires: {},
    consumes: [{ res: "fuel", amount: (s, c) => c.HUB_EASY_FUEL_COST }],
    produces: [
      { res: "flux", amount: (s, c) => c.HUB_EASY_FLUX_YIELD },
      { res: "rep", amount: (s, c) => c.HUB_EASY_REP_YIELD },
    ],
    logSuccess: "Delivered cargo supplies to depot. Earned Flux and Station Reputation.",
  },
  hub_quest_hard: {
    label: "VIP Escort Contract",
    uiClass: GAME_DATA.dom.classes.btnAction,
    requires: { rep: GAME_DATA.config.HUB_HARD_REP_REQ },
    consumes: [{ res: "fuel", amount: (s, c) => c.HUB_HARD_FUEL_COST }],
    produces: [{ res: "flux", amount: (s, c) => c.HUB_HARD_FLUX_YIELD }],
    logSuccess: "High-value VIP transported safely. Received substantial Flux bounty.",
  },
};
/* ========================================================
          DIORAMA PIPELINE (BRIDGE TO ARTWORK-BROWSER.HTML)
          ======================================================== */
