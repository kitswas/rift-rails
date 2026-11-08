// Black Market plugin entry — runs inside the plugin worker.
// The host concatenates worker bootstrap + this file + kickoff into one
// module, so `activate` must be a top-level function declaration; the
// default export keeps the file importable as a normal ES module.
// No DOM/window/localStorage/fetch: only the sandboxed `api` is used.
function activate(api) {
  api.registerAction({
    id: "bm_trade",
    label: "Black Market Trade",
    desc: "Parley with the Black Market; only trade talk, no state change.",
  });

  api.registerNode({
    id: "black_market",
    label: "Black Market",
    desc: "A shadow exchange that appears once the voyage runs deep.",
  });

  api.on("afterJump", async () => {
    const s = api.state();
    if (!s || s.jumpCount < 2) return;
    const prev = await api.storage.get("stint");
    const stint = (typeof prev === "number" ? prev : 0) + 1;
    await api.storage.set("stint", stint);
    api.log(`black_market stint ${stint} on jump ${s.jumpCount}`);
  });
}

export default { activate };
