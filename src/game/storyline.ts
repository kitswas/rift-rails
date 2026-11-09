import type { StoryTraceEntry } from "./types";
import type { Voyage } from "./voyage";

export type StoryEvent = "afterAction" | "afterJump" | "onEnter";

export type StoryTrigger =
  | { event: "afterAction"; actionId: string; success?: boolean }
  | { event: "afterJump"; jumpCount?: number }
  | { event: "onEnter"; phase: string };

export interface StoryChoice {
  id: string;
  label: string;
  next: string | null;
}

export interface StoryNode {
  id: string;
  actor: string;
  verb: string;
  target: string;
  outcome: string;
  text: string;
  trigger?: StoryTrigger;
  choices: StoryChoice[];
}

export interface StorylineDefinition {
  id: string;
  title: string;
  description: string;
  start: StoryTrigger;
  first: string;
  nodes: StoryNode[];
}

export interface StoryScene {
  pluginId: string;
  storyId: string;
  title: string;
  node: StoryNode;
}

export interface StoryJournalEntry {
  pluginId: string;
  storyId: string;
  title: string;
  description: string;
  status: "waiting" | "active" | "complete";
  step: string | null;
  trace: StoryTraceEntry[];
}

export interface StorylineHooks {
  show: (scene: StoryScene, choose: (choiceIndex: number) => void) => void;
  changed?: () => void;
  save?: () => void;
}

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/i;
const MAX_STORY_BYTES = 64 * 1024;
const MAX_NODES = 16;
const MAX_CHOICES = 2;
const MAX_STORIES = 32;
const STORY_DIALOGUE_PHASES = new Set(["START", "IDLE", "ENCOUNTER"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function parseTrigger(value: unknown): StoryTrigger | null {
  if (!isRecord(value) || !["afterAction", "afterJump", "onEnter"].includes(String(value.event))) {
    return null;
  }
  const event = value.event as StoryEvent;
  if (event === "afterAction") {
    if (!boundedText(value.actionId, 128)) return null;
    if (value.success !== undefined && typeof value.success !== "boolean") return null;
    return {
      event,
      actionId: value.actionId,
      ...(value.success === undefined ? {} : { success: value.success }),
    };
  }
  if (event === "afterJump") {
    if (
      value.jumpCount !== undefined &&
      (!Number.isInteger(value.jumpCount) || (value.jumpCount as number) < 1)
    )
      return null;
    return {
      event,
      ...(value.jumpCount === undefined ? {} : { jumpCount: value.jumpCount as number }),
    };
  }
  if (!boundedText(value.phase, 64) || !STORY_DIALOGUE_PHASES.has(value.phase)) return null;
  return { event, phase: value.phase };
}

function parseNode(value: unknown): StoryNode | null {
  if (!isRecord(value) || !ID_RE.test(String(value.id ?? ""))) return null;
  if (
    !boundedText(value.actor, 80) ||
    !boundedText(value.verb, 80) ||
    !boundedText(value.target, 120) ||
    !boundedText(value.outcome, 240) ||
    !boundedText(value.text, 2000)
  )
    return null;
  const trigger = value.trigger === undefined ? undefined : parseTrigger(value.trigger);
  if (value.trigger !== undefined && trigger === null) return null;
  if (
    !Array.isArray(value.choices) ||
    value.choices.length < 1 ||
    value.choices.length > MAX_CHOICES
  )
    return null;
  const choices: StoryChoice[] = [];
  const ids = new Set<string>();
  for (const choice of value.choices) {
    if (
      !isRecord(choice) ||
      !ID_RE.test(String(choice.id ?? "")) ||
      ids.has(choice.id as string) ||
      !boundedText(choice.label, 240) ||
      (choice.next !== null && (typeof choice.next !== "string" || !ID_RE.test(choice.next)))
    )
      return null;
    ids.add(choice.id as string);
    choices.push({
      id: choice.id as string,
      label: choice.label,
      next: choice.next as string | null,
    });
  }
  return {
    id: value.id as string,
    actor: value.actor,
    verb: value.verb,
    target: value.target,
    outcome: value.outcome,
    text: value.text,
    ...(trigger ? { trigger } : {}),
    choices,
  };
}

export function validateStoryline(value: unknown): StorylineDefinition | null {
  try {
    if (!isRecord(value) || JSON.stringify(value).length > MAX_STORY_BYTES) return null;
  } catch {
    return null;
  }
  if (
    !ID_RE.test(String(value.id ?? "")) ||
    !boundedText(value.title, 120) ||
    !boundedText(value.description, 500) ||
    !ID_RE.test(String(value.first ?? ""))
  )
    return null;
  const start = parseTrigger(value.start);
  if (
    !start ||
    !Array.isArray(value.nodes) ||
    value.nodes.length < 1 ||
    value.nodes.length > MAX_NODES
  )
    return null;
  const first = value.first as string;
  const nodes: StoryNode[] = [];
  const byId = new Map<string, StoryNode>();
  for (const raw of value.nodes) {
    const node = parseNode(raw);
    if (!node || byId.has(node.id)) return null;
    nodes.push(node);
    byId.set(node.id, node);
  }
  if (!byId.has(first) || byId.get(first)?.trigger) return null;
  for (const node of nodes) {
    for (const choice of node.choices) if (choice.next && !byId.has(choice.next)) return null;
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    const node = byId.get(id);
    if (!node) return false;
    visiting.add(id);
    for (const choice of node.choices) if (choice.next && !visit(choice.next)) return false;
    visiting.delete(id);
    visited.add(id);
    return true;
  };
  if (!visit(first) || visited.size !== nodes.length) return null;
  return {
    id: value.id as string,
    title: value.title,
    description: value.description,
    start,
    first,
    nodes,
  };
}

function matches(trigger: StoryTrigger, event: StoryEvent, payload: unknown): boolean {
  if (trigger.event !== event || !isRecord(payload)) return false;
  if (trigger.event === "afterAction") {
    return trigger.actionId === payload.actionId && (trigger.success === undefined || trigger.success === payload.success);
  }
  if (trigger.event === "afterJump") {
    return trigger.jumpCount === undefined || trigger.jumpCount === payload.jumpCount;
  }
  return trigger.phase === payload.phase;
}

export class StorylineService {
  private readonly voyage: Voyage;
  private readonly hooks: StorylineHooks;
  private readonly stories = new Map<
    string,
    { pluginId: string; definition: StorylineDefinition }
  >();
  private readonly presented = new Set<string>();
  private started = false;

  constructor(voyage: Voyage, hooks: StorylineHooks) {
    this.voyage = voyage;
    this.hooks = hooks;
  }

  register(pluginId: string, raw: unknown): void {
    const definition = validateStoryline(raw);
    if (!definition) throw new Error("invalid storyline definition");
    const key = this.key(pluginId, definition.id);
    if (this.stories.has(key)) throw new Error(`duplicate storyline: ${definition.id}`);
    if (this.stories.size >= MAX_STORIES) throw new Error("storyline limit reached");
    if (
      !this.voyage.state.storyProgress[key] &&
      Object.keys(this.voyage.state.storyProgress).length >= MAX_STORIES
    ) {
      throw new Error("saved storyline limit reached");
    }
    this.stories.set(key, { pluginId, definition });
    this.hooks.changed?.();
    if (this.started) this.resume(key);
  }

  removePlugin(pluginId: string): void {
    for (const [key, story] of this.stories) {
      if (story.pluginId !== pluginId) continue;
      this.stories.delete(key);
      this.presented.delete(key);
    }
    this.hooks.changed?.();
  }

  start(): void {
    this.started = true;
    for (const key of this.stories.keys()) this.resume(key);
    this.hooks.changed?.();
  }

  handleEvent(event: StoryEvent, payload: unknown): void {
    if (this.voyage.state.phase === "DEAD" || this.voyage.state.phase === "STRANDED") return;
    for (const [key, { pluginId, definition }] of this.stories) {
      const progress = this.voyage.state.storyProgress[key];
      if (!progress) {
        if (!matches(definition.start, event, payload)) continue;
        this.voyage.state.storyProgress[key] = {
          status: "active",
          nodeId: definition.first,
          waiting: false,
          trace: [],
        };
        this.changed();
        this.present(key, pluginId, definition);
        continue;
      }
      if (progress.status !== "active" || !progress.waiting) continue;
      const node = definition.nodes.find((item) => item.id === progress.nodeId);
      if (!node?.trigger || !matches(node.trigger, event, payload)) continue;
      progress.waiting = false;
      this.changed();
      this.present(key, pluginId, definition);
    }
    for (const key of this.stories.keys()) this.resume(key);
  }

  choose(pluginId: string, storyId: string, choiceIndex: number): void {
    const key = this.key(pluginId, storyId);
    const story = this.stories.get(key);
    const progress = this.voyage.state.storyProgress[key];
    const node = story?.definition.nodes.find((item) => item.id === progress?.nodeId);
    const choice = node?.choices[choiceIndex];
    if (!story || !progress || progress.status !== "active" || progress.waiting || !node || !choice)
      return;
    this.presented.delete(key);
    progress.trace.push({ nodeId: node.id, choiceId: choice.id });
    if (!choice.next) {
      progress.status = "complete";
      this.changed();
      return;
    }
    progress.nodeId = choice.next;
    const next = story.definition.nodes.find((item) => item.id === choice.next);
    progress.waiting = !!next?.trigger;
    this.changed();
    if (!progress.waiting) this.present(key, pluginId, story.definition);
  }

  journal(): StoryJournalEntry[] {
    return [...this.stories.entries()].map(([key, { pluginId, definition }]) => {
      const progress = this.voyage.state.storyProgress[key];
      const node =
        progress?.status === "active"
          ? definition.nodes.find((item) => item.id === progress.nodeId)
          : undefined;
      const trace: StoryTraceEntry[] = (progress?.trace ?? []).map((step) => {
        const traceNode = definition.nodes.find((item) => item.id === step.nodeId);
        const traceChoice = traceNode?.choices.find((item) => item.id === step.choiceId);
        return {
          nodeId: step.nodeId,
          choiceId: step.choiceId,
          actor: traceNode?.actor ?? "Unknown actor",
          verb: traceNode?.verb ?? "selected",
          target: traceNode?.target ?? step.nodeId,
          outcome: traceNode?.outcome ?? "This step is no longer available",
          choiceLabel: traceChoice?.label ?? step.choiceId,
        };
      });
      return {
        pluginId,
        storyId: definition.id,
        title: definition.title,
        description: definition.description,
        status: progress?.status === "complete" ? "complete" : progress ? "active" : "waiting",
        step: node ? `${node.actor} ${node.verb} ${node.target}: ${node.outcome}` : null,
        trace,
      };
    });
  }

  private key(pluginId: string, storyId: string): string {
    return `${pluginId}:${storyId}`;
  }

  private changed(): void {
    this.hooks.changed?.();
    this.hooks.save?.();
  }

  private resume(key: string): void {
    const story = this.stories.get(key);
    const progress = this.voyage.state.storyProgress[key];
    if (story && progress?.status === "active" && !progress.waiting) {
      this.present(key, story.pluginId, story.definition);
    }
  }

  private present(key: string, pluginId: string, definition: StorylineDefinition): void {
    const progress = this.voyage.state.storyProgress[key];
    const node = definition.nodes.find((item) => item.id === progress?.nodeId);
    if (!progress || progress.status !== "active" || progress.waiting || !node) return;
    if (this.presented.has(key) || !STORY_DIALOGUE_PHASES.has(this.voyage.state.phase)) return;
    this.presented.add(key);
    this.hooks.show(
      { pluginId, storyId: definition.id, title: definition.title, node },
      (choiceIndex) => this.choose(pluginId, definition.id, choiceIndex),
    );
  }
}
