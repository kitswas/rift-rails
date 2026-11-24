import type { PluginLifecycle } from "../../src/game/workerProtocol";

// Rail Keeper storyline plugin. Narrative only: no grants, no engine edits.
// The first scene sets up Keeper Halden and the damaged line. The overlay
// choice picks which next verb to wait for; the matching real action resolves
// the branch and writes one narrative log line per voyage.
const STORAGE_KEY = "logged-branches";

const BRANCH_LOGS: Record<string, string> = {
  res_drill: "rail-keeper: Halden drilled the splintered tie; the old oath holds.",
  res_siphon: "rail-keeper: Halden siphoned the vapor vent; he keeps his watch.",
};

const plugin: PluginLifecycle = {
  mount(api) {
    api.registerStoryline({
      id: "rail-keeper-oath",
      title: "The Keeper's Oath",
      description: "A splintered tie and a vapor vent ask which repair the line will remember.",
      start: { event: "afterAction", actionId: "res_harvest", success: true },
      first: "keeper-verdict",
      nodes: [
        {
          id: "keeper-verdict",
          actor: "The splintered tie",
          verb: "pinches",
          target: "the vapor vent",
          outcome: "Keeper Halden waits for the next pass",
          text: "A splintered tie pinches the vapor vent shut. Keeper Halden kneels, running a gloved hand over the warped iron. 'This line carried my father's freight,' he says. 'It will carry yours — if we choose the right repair.'",
          choices: [
            {
              id: "wait-drill",
              label: "Wait for Halden to drill the splintered tie",
              next: "drill-tie",
            },
            {
              id: "wait-siphon",
              label: "Wait for Halden to siphon the vapor vent",
              next: "siphon-vent",
            },
          ],
        },
        {
          id: "drill-tie",
          actor: "Keeper Halden",
          verb: "drills",
          target: "the splintered tie",
          outcome: "the rail is freed and the oath is renewed",
          text: "Halden sets the bit against the splintered tie and bores through the split grain. The rail gives with a groan. 'There,' he breathes. 'The old line still has a pulse.'",
          trigger: { event: "afterAction", actionId: "res_drill", success: true },
          choices: [{ id: "renew-oath", label: "Renew the oath", next: null }],
        },
        {
          id: "siphon-vent",
          actor: "Keeper Halden",
          verb: "siphons",
          target: "the vapor vent",
          outcome: "the vent clears and Halden keeps his watch",
          text: "Halden couples the siphon to the vapor vent and draws off the trapped gas. The pressure hiss fades. 'Better than a burst line,' he says. 'I'll keep watch from here.'",
          trigger: { event: "afterAction", actionId: "res_siphon", success: true },
          choices: [{ id: "keep-watch", label: "Let him keep watch", next: null }],
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
