// Salvage Scanner plugin entry — runs inside the plugin worker.
// The host concatenates worker bootstrap + this file + kickoff into one
// module, so `activate` must be a top-level function declaration; the
// default export keeps the file importable as a normal ES module.
function activate(api) {
  api.registerAction({
    id: "scan_salvage",
    label: "Scan Salvage",
    desc: "Run a deep scan for salvageable wreckage.",
  });

  api.registerNode({
    id: "wreck_field",
    label: "Wreck Field",
    desc: "A debris field littered with recoverable wreckage.",
  });

  api.on("beforeAction", (p) => {
    api.log(`salvage-scanner: beforeAction ${p && p.actionId ? p.actionId : "?"}`);
  });

  api.on("afterAction", (p) => {
    api.log(`salvage-scanner: afterAction ${p && p.actionId ? p.actionId : "?"} success=${p ? p.success : "?"}`);
  });

  api.on("afterJump", () => {
    const s = api.state();
    void api.storage.set("jumpsScanned", s ? s.jumpCount : 0);
  });
}

export default { activate };
