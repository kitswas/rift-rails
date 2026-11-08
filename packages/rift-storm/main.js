// Rift Storm plugin entry — runs inside the plugin worker.
// The host concatenates worker bootstrap + this file + kickoff into one
// module, so `activate` must be a top-level function declaration; the
// default export keeps the file importable as a normal ES module.
function activate(api) {
  api.registerAction({
    id: "storm_ride",
    label: "Ride the Storm",
    desc: "Ride the rift storm for flux.",
  });

  api.registerNode({
    id: "storm_eye",
    label: "Storm Eye",
    desc: "The calm eye at the heart of the rift storm.",
  });

  api.on("afterJump", () => {
    const s = api.state();
    if (!s) return;
    const stormIntensity = s.jumpCount % 5;
    void api.storage.set("lastStorm", stormIntensity);
    api.log(`storm intensity ${stormIntensity} at jump ${s.jumpCount}`);
    if (s.jumpCount % 3 === 0) {
      void api.grant({ kind: "adjustResource", resource: "flux", amount: 5 });
    }
  });
}

export default { activate };
