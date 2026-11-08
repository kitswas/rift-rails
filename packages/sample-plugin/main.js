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
