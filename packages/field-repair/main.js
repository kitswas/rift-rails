// @ts-nocheck - plain-JS plugin entry, type-checked via tests/field-repair.test.ts.
// Field Repair plugin entry — runs inside the plugin worker.
// The host concatenates worker bootstrap + this file + kickoff into one
// module, so `plugin` must be declared at top level for the host lifecycle;
// the default export keeps the file importable as a normal ES module.
//
// Mechanic: a single-use emergency hull stabilizer.
//   * Watches hull in state snapshots on `afterAction` (post-action snapshot,
//     i.e. after combat/drill/maze hull damage has landed) and `afterJump`.
//   * Fires once, only when hull <= 30 (critical) and the voyage is not
//     already DEAD/STRANDED: +25 hull via host-clamped adjustResource.
//   * Usage is persistent per voyage: `expended` is cached in memory for the
//     session, but the authoritative "used" flag lives in api.storage, so it
//     survives save/load and plugin reloads.
//   * Log discipline: a deploy line on use, a ready/spent status line on
//     every `afterJump`, and a failure line if the grant is rejected (no
//     charge is burned when the host refuses the grant).
const plugin = {
  mount(api) {
    const CRITICAL_HULL = 30;
    const REPAIR_AMOUNT = 25;
    const STORAGE_KEY = "stabilizer";

    // `expended` is process-local; persisted truth lives in api.storage, so the
    // single charge survives save/load and plugin reloads (fresh worker).
    let expended = false;
    let inFlight = false;

    function isTerminal(phase) {
      return phase === "DEAD" || phase === "STRANDED";
    }

    function isCritical(hull) {
      return typeof hull === "number" && Number.isFinite(hull) && hull <= CRITICAL_HULL;
    }

    async function maybeDeploy() {
      // Cheap synchronous guards first: at most one deploy attempt in flight,
      // and none at all once spent.
      if (expended || inFlight) return;
      const before = api.state();
      if (!before || isTerminal(before.phase) || !isCritical(before.hull)) return;

      inFlight = true;
      try {
        const saved = await api.storage.get(STORAGE_KEY);
        if (saved && saved.used === true) {
          expended = true;
          return;
        }
        // Re-read after the storage round-trip. The worker processes queued
        // messages in order, so this snapshot is still before any newer event
        // is handled; never spend the charge on a stale emergency.
        const during = api.state();
        if (!during || isTerminal(during.phase) || !isCritical(during.hull)) return;

        const result = await api.grant({
          kind: "adjustResource",
          resource: "hull",
          amount: REPAIR_AMOUNT,
        });
        if (!result || result.ok !== true) {
          api.log(
            "field-repair: stabilizer failed to deploy (" +
              ((result && result.reason) || "unknown") +
              "); it stays armed while hull is critical",
          );
          return;
        }
        expended = true;
        await api.storage.set(STORAGE_KEY, {
          used: true,
          jump: during.jumpCount,
          hullBefore: during.hull,
        });
        api.log(
          "field-repair: emergency hull stabilizer deployed at jump " +
            during.jumpCount +
            " (hull " +
            during.hull +
            ", +" +
            REPAIR_AMOUNT +
            " hull)",
        );
      } catch (err) {
        api.log("field-repair: stabilizer error (" + ((err && err.message) || err) + ")");
      } finally {
        inFlight = false;
      }
    }

    api.on("afterAction", () => {
      void maybeDeploy();
    });

    api.on("afterJump", async () => {
      await maybeDeploy();
      if (expended) {
        const s = api.state();
        api.log("field-repair: stabilizer spent (jump " + (s ? s.jumpCount : "?") + ")");
      } else {
        api.log("field-repair: stabilizer ready");
      }
    });
  },
  unmount() {},
};

export default plugin;
