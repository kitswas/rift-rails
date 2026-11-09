// @ts-nocheck — plain-JS plugin entry, type-checked via tests/rift-salvager.test.ts.
// Rift Salvager plugin entry — runs inside the plugin worker.
// The host concatenates worker bootstrap + this file + kickoff into one
// module, so `plugin` must be declared at top level for the host lifecycle;
// the default export keeps the file importable as a normal ES module.
//
// Mechanic: Salvage Melt trades 10 Fuel + 1 Energy for 20 Flux. The rate
// is deliberately lossy (hub supply contracts pay 35 Flux per 10 Fuel,
// Safe Harvest pays 30 Flux per 1 Energy), so the decision is about
// location and surplus: deterministic flux away from hub/res nodes when
// fuel is surplus, at the price of the energy a jump would refresh.
// No grants are issued, so there is no free-resource loop.
const plugin = {
  mount(api) {
    api.registerAction({
      id: "salvage_melt",
      label: "Salvage Melt",
      desc: "Smelt 10 Fuel and 1 Energy into 20 Flux. Lossy, but works away from hub contracts.",
      consumes: [
        { res: "energy", amount: 1 },
        { res: "fuel", amount: 10 },
      ],
      produces: [{ res: "flux", amount: 20 }],
      logSuccess: "Salvage furnace melted fuel canisters into 20 Flux.",
    });

    api.registerNode({
      id: "salvage_yard",
      label: "Salvage Yard",
      desc: "A drifting yard where wreck cores are smelted for flux.",
      exploreCost: 1,
      isHub: false,
      actions: ["salvage_melt"],
    });

    // Audit melts per jump in plugin storage. Real payloads:
    // afterAction { actionId, success }, afterJump { jumpCount }.
    api.on("afterAction", async (payload) => {
      const actionId = payload && typeof payload.actionId === "string" ? payload.actionId : "";
      if (actionId !== "salvage_melt" && !actionId.endsWith(":salvage_melt")) return;
      if (!payload || payload.success !== true) return;
      const prev = await api.storage.get("meltsThisJump");
      const melts = (typeof prev === "number" && Number.isFinite(prev) ? prev : 0) + 1;
      await api.storage.set("meltsThisJump", melts);
      api.log(`rift-salvager: melt ${melts} this jump`);
    });

    api.on("afterJump", async (payload) => {
      const jumpCount =
        payload && typeof payload.jumpCount === "number" && Number.isFinite(payload.jumpCount)
          ? payload.jumpCount
          : 0;
      await api.storage.set("meltsThisJump", 0);
      await api.storage.set("lastJump", jumpCount);
    });
  },
  unmount() {},
};

export default plugin;
