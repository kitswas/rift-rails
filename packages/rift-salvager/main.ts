import type { PluginLifecycle } from "../../src/game/workerProtocol";
// Rift Salvager plugin entry - runs inside the plugin worker.
// The host concatenates worker bootstrap + build output + kickoff into one
// module, so `plugin` must be declared at top level for the host lifecycle;
// the default export keeps the file importable as a normal ES module.
//
// Mechanic: Salvage Melt trades 10 Fuel + 1 Energy for 20 Flux. The rate
// is deliberately lossy (hub supply contracts pay 35 Flux per 10 Fuel,
// Safe Harvest pays 30 Flux per 1 Energy), so the decision is about
// location and surplus: deterministic flux away from hub/res nodes when
// fuel is surplus, at the price of the energy a jump would refresh.
// No grants are issued, so there is no free-resource loop.
// Registered ids are host-namespaced, so the action arrives as
// "rift-salvager:salvage_melt".
const MELT_ACTION_ID = "rift-salvager:salvage_melt";

const plugin: PluginLifecycle = {
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

    // Melt count is authoritative in memory for the session; storage is only
    // read once to seed it after a reload. afterJump resets both.
    let meltsThisJump: number | null = null;
    async function seedMelts(): Promise<number> {
      if (meltsThisJump !== null) return meltsThisJump;
      const prev = await api.storage.get("meltsThisJump");
      meltsThisJump = typeof prev === "number" && Number.isFinite(prev) ? prev : 0;
      return meltsThisJump;
    }

    const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

    // Audit melts per jump in plugin storage. Real payloads:
    // afterAction { actionId, success }, afterJump { jumpCount }.
    api.on("afterAction", async (payload) => {
      try {
        const p = payload as { actionId?: unknown; success?: unknown } | null;
        const actionId = p && typeof p.actionId === "string" ? p.actionId : "";
        if (actionId !== MELT_ACTION_ID) return;
        if (!p || p.success !== true) return;
        const current = await seedMelts();
        meltsThisJump = current + 1;
        await api.storage.set("meltsThisJump", meltsThisJump);
        api.log(`rift-salvager: melt ${meltsThisJump} this jump`);
      } catch (err) {
        api.log(`rift-salvager: afterAction error (${errText(err)})`);
      }
    });

    api.on("afterJump", async (payload) => {
      try {
        const p = payload as { jumpCount?: unknown } | null;
        const jumpCount =
          p && typeof p.jumpCount === "number" && Number.isFinite(p.jumpCount) ? p.jumpCount : 0;
        meltsThisJump = 0;
        await api.storage.set("meltsThisJump", 0);
        await api.storage.set("lastJump", jumpCount);
      } catch (err) {
        api.log(`rift-salvager: afterJump error (${errText(err)})`);
      }
    });
  },
  unmount() {},
};

export default plugin;
