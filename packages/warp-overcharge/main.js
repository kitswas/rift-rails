// Warp Overcharge plugin entry; runs inside the plugin worker.
// The host concatenates worker bootstrap + this file + kickoff into one
// module, so `activate` must be a top-level function declaration; the
// default export keeps the file importable as a normal ES module.
function activate(api) {
  api.registerAction({
    id: "overcharge",
    label: "Warp Overcharge",
    desc: "Channel warp energy; efficient at low energy levels.",
  });

  api.registerNode({
    id: "overcharge_bay",
    label: "Overcharge Bay",
    desc: "A dockside bay where warp drives are overcharged.",
  });

  api.on("afterJump", () => {
    const s = api.state();
    if (!s) return;
    if (s.energy >= 3) api.log("overcharge ready");
    else api.log("overcharge charging");
    if (s.energy < 2) {
      void api.grant({ kind: "adjustResource", resource: "energy", amount: 1 });
    }
    void api.storage.set("lastOverchargeJump", s.jumpCount);
  });
}

export default { activate };
