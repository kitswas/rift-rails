import type {
  ActionId,
  Cutscene,
  CutsceneId,
  GameAction,
  NodeDefinition,
  NodeId,
  ProceduralTheme,
  ThemeId,
  YardItem,
  YardKey,
} from "./types";

function register<T>(map: Map<string, T>, id: string, value: T): void {
  if (map.has(id)) throw new Error(`Duplicate registration: ${id}`);
  map.set(id, value);
}

function unregister<T>(map: Map<string, T>, id: string): void {
  if (!map.has(id)) throw new Error(`Unknown registration: ${id}`);
  map.delete(id);
}

/** Plugin registry. Duplicate ids throw; unknown unregister throws. */
export class Registry {
  private readonly actions = new Map<ActionId, GameAction>();
  private readonly nodes = new Map<NodeId, NodeDefinition>();
  private readonly yard = new Map<YardKey, YardItem>();
  private readonly cutscenes = new Map<CutsceneId, Cutscene>();
  private readonly themes = new Map<ThemeId, ProceduralTheme>();

  // Actions
  registerAction(id: ActionId, def: GameAction): void {
    register(this.actions, id, def);
  }
  unregisterAction(id: ActionId): void {
    unregister(this.actions, id);
  }
  listActions(): GameAction[] {
    return [...this.actions.values()];
  }
  listActionIds(): ActionId[] {
    return [...this.actions.keys()];
  }
  getAction(id: ActionId): GameAction | undefined {
    return this.actions.get(id);
  }

  // Nodes
  registerNode(id: NodeId, def: NodeDefinition): void {
    register(this.nodes, id, def);
  }
  unregisterNode(id: NodeId): void {
    unregister(this.nodes, id);
  }
  listNodes(): NodeDefinition[] {
    return [...this.nodes.values()];
  }
  listNodeIds(): NodeId[] {
    return [...this.nodes.keys()];
  }
  getNode(id: NodeId): NodeDefinition | undefined {
    return this.nodes.get(id);
  }

  // Yard
  registerYardItem(id: YardKey, def: YardItem): void {
    register(this.yard, id, def);
  }
  unregisterYardItem(id: YardKey): void {
    unregister(this.yard, id);
  }
  listYardItems(): YardItem[] {
    return [...this.yard.values()];
  }
  listYardKeys(): YardKey[] {
    return [...this.yard.keys()];
  }
  getYardItem(id: YardKey): YardItem | undefined {
    return this.yard.get(id);
  }

  // Cutscenes
  registerCutscene(id: CutsceneId, def: Cutscene): void {
    register(this.cutscenes, id, def);
  }
  unregisterCutscene(id: CutsceneId): void {
    unregister(this.cutscenes, id);
  }
  listCutscenes(): Cutscene[] {
    return [...this.cutscenes.values()];
  }
  listCutsceneIds(): CutsceneId[] {
    return [...this.cutscenes.keys()];
  }
  getCutscene(id: CutsceneId): Cutscene | undefined {
    return this.cutscenes.get(id);
  }

  // Themes
  registerTheme(id: ThemeId, def: ProceduralTheme): void {
    register(this.themes, id, def);
  }
  unregisterTheme(id: ThemeId): void {
    unregister(this.themes, id);
  }
  listThemes(): ProceduralTheme[] {
    return [...this.themes.values()];
  }
  listThemeIds(): ThemeId[] {
    return [...this.themes.keys()];
  }
  getTheme(id: ThemeId): ProceduralTheme | undefined {
    return this.themes.get(id);
  }
}
