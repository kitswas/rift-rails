// Contract Board plugin entry — runs inside the plugin worker.
// The host concatenates worker bootstrap + this file + kickoff into one
// module, so `activate` must be a top-level function declaration; the
// default export keeps the file importable as a normal ES module.
function activate(api) {
  api.registerAction({
    id: "contract_take",
    label: "Take Contract",
    desc: "Take a contract from the board.",
  });

  api.registerNode({
    id: "contract_hub",
    label: "Contract Hub",
    desc: "A board where contracts are posted and claimed.",
  });

  api.on("afterJump", () => {
    const s = api.state();
    if (s && typeof s.rep === "number" && s.rep >= 2) {
      api.log("contract bonus");
    }
  });

  api.on("onSave", async () => {
    const v = await api.storage.get("contractsDone");
    const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
    void api.storage.set("contractsDone", n + 1);
  });
}

export default { activate };
