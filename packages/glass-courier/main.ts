import type { PluginLifecycle } from "../../src/game/workerProtocol";

// Glass Courier storyline plugin. Narrative only: no grants, no engine edits.
// The first scene sets up Courier Sable and an unclaimed crate. The overlay
// choice picks which next verb to wait for; the matching real action resolves
// the branch and writes one narrative log line per voyage.
const STORAGE_KEY = "logged-branches";

const BRANCH_LOGS: Record<string, string> = {
  hub_quest_hard:
    "glass-courier: Sable escorted the marked crate; the consignee signed in silence.",
  hub_rest: "glass-courier: Sable repaired the depot sign-lamp; the yard glowed through the night.",
};

const plugin: PluginLifecycle = {
  mount(api) {
    api.registerStoryline({
      id: "glass-courier-ledger",
      title: "The Glass Ledger",
      description: "An unclaimed crate at the depot asks what kind of courier Sable will be.",
      start: { event: "afterAction", actionId: "hub_quest_easy", success: true },
      first: "crate-arrival",
      nodes: [
        {
          id: "crate-arrival",
          actor: "The marked crate",
          verb: "outshines",
          target: "the depot sign-lamp",
          outcome: "Courier Sable weighs her next commission",
          text: "A delivery crate sits unclaimed beneath the depot sign-lamp, its wax seal still bright. Courier Sable turns the address over twice. 'Two ways to earn a name here,' she says. 'Quiet and costly, or slow and kind.'",
          choices: [
            {
              id: "wait-escort",
              label: "Wait for Sable to escort the marked crate",
              next: "escort-crate",
            },
            {
              id: "wait-repair",
              label: "Wait for Sable to repair the depot sign-lamp",
              next: "repair-lamp",
            },
          ],
        },
        {
          id: "escort-crate",
          actor: "Courier Sable",
          verb: "escorts",
          target: "the marked crate",
          outcome: "the consignee receives a silent, costly delivery",
          text: "Sable takes the VIP contract and walks the marked crate to the consignee herself. No one asks what was inside. She notes the delivery in her glass ledger and pockets the fee.",
          trigger: { event: "afterAction", actionId: "hub_quest_hard", success: true },
          choices: [{ id: "file-ledger", label: "File the ledger", next: null }],
        },
        {
          id: "repair-lamp",
          actor: "Courier Sable",
          verb: "repairs",
          target: "the depot sign-lamp",
          outcome: "the yard glows and Sable stays the night",
          text: "Sable spends her shift at the dockyard repairs, coaxing the depot sign-lamp back to life. The yard glows warm again. She leaves the crate for morning and stays to watch the light.",
          trigger: { event: "afterAction", actionId: "hub_rest", success: true },
          choices: [{ id: "close-ledger", label: "Close the ledger", next: null }],
        },
      ],
    });

    const logged = new Set<string>();
    let tail: Promise<void> = api.storage.get(STORAGE_KEY).then(
      (saved) => {
        if (Array.isArray(saved)) {
          for (const id of saved) if (typeof id === "string") logged.add(id);
        }
      },
      () => {},
    );

    api.on("afterAction", (payload) => {
      const raw = payload as { actionId?: unknown; success?: unknown } | null;
      const actionId = raw?.actionId;
      if (raw?.success !== true || typeof actionId !== "string") return;
      const line = BRANCH_LOGS[actionId];
      if (!line) return;
      tail = tail.then(async () => {
        if (logged.has(actionId)) return;
        logged.add(actionId);
        api.log(line);
        try {
          await api.storage.set(STORAGE_KEY, [...logged]);
        } catch {
          // Session guard still holds if persistence is unavailable.
        }
      });
    });
  },
  unmount() {},
};

export default plugin;
