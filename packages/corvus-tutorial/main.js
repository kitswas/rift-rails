const plugin = {
  mount(api) {
    api.registerCutscene({
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
    });

    api.registerCutscene({
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
    });

    api.registerCutscene({
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
    });

    api.registerCutscene({
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
    });

    api.registerCutscene({
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
    });
  },
  unmount() {},
};

export default plugin;
