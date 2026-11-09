// Sample plugin entry — runs inside the plugin worker.
// The host concatenates worker bootstrap + this file + kickoff into one
// module, so `activate` must be a top-level function declaration; the
// default export keeps the file importable as a normal ES module.
function activate(api) {
  api.registerAction({
    id: "smuggle_fuel",
    label: "Smuggle Fuel",
    desc: "Trade 10 flux for 15 fuel at a smuggler's price.",
  });

  api.registerNode({
    id: "smuggle_point",
    label: "Smuggle Point",
    desc: "A quiet dock where fuel changes hands off the books.",
  });

  api.registerStoryline({
    id: "lost-lantern",
    title: "The Lost Lantern",
    description: "A faint rail signal asks the Conductor to choose whether to answer.",
    start: { event: "afterJump", jumpCount: 2 },
    first: "signal",
    nodes: [
      {
        id: "signal",
        actor: "Rail Signal",
        verb: "calls",
        target: "the locomotive",
        outcome: "the Conductor must choose whether to answer",
        text: "A lantern flickers from a dead spur. One short pulse. One long. Someone waits beyond the fog.",
        choices: [
          { id: "answer", label: "Answer the signal", next: "answer" },
          { id: "pass", label: "Keep the train moving", next: "pass" },
        ],
      },
      {
        id: "answer",
        actor: "Conductor",
        verb: "answers",
        target: "the lantern",
        outcome: "a stranded traveler receives a route home",
        text: "The lantern answers with a steady glow. A grateful voice sends one final coordinate before the signal fades.",
        choices: [{ id: "close", label: "Record the coordinate", next: null }],
      },
      {
        id: "pass",
        actor: "Conductor",
        verb: "passes",
        target: "the lantern",
        outcome: "the unknown signal disappears behind the train",
        text: "The locomotive holds its course. In the rear glass, the lantern dims to a pinprick and vanishes.",
        choices: [{ id: "continue", label: "Continue the voyage", next: null }],
      },
    ],
  });

  api.on("afterJump", () => {
    // Greeting only: mutate via api.grant() for state changes (see README).
    const s = api.state();
    if (s && s.jumpCount >= 3) api.log(`smuggler salutes jump ${s.jumpCount}`);
  });

  api.on("onSave", () => {
    const s = api.state();
    void api.storage.set("lastSaveJump", s ? s.jumpCount : 0);
  });
}

export default { activate };
