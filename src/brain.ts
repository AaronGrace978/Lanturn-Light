import type {
  BrainReply,
  ConstructKind,
  ConstructPlan,
  IntentionSignal,
  Vec3,
} from "./types.js";

export interface RingBrain {
  /** Turn will into a construct plan + spoken reply. */
  deliberate(intention: IntentionSignal): Promise<BrainReply>;
}

function ring(count: number, radius: number, z = 1.2): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const a = (2 * Math.PI * i) / count;
    pts.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius, z });
  }
  return pts;
}

function line(count: number, length: number, z = 1.5): Vec3[] {
  const pts: Vec3[] = [];
  const start = -length / 2;
  for (let i = 0; i < count; i++) {
    pts.push({
      x: start + (length * i) / Math.max(1, count - 1),
      y: 0,
      z,
    });
  }
  return pts;
}

function parseKind(utterance: string): ConstructKind {
  const u = utterance.toLowerCase();
  if (u.includes("shield") || u.includes("wall") || u.includes("barrier")) {
    return "shield";
  }
  if (u.includes("beam") || u.includes("blast") || u.includes("laser")) {
    return "beam";
  }
  if (u.includes("platform") || u.includes("bridge") || u.includes("lift")) {
    return "platform";
  }
  if (u.includes("grasp") || u.includes("grab") || u.includes("carry")) {
    return "grasp";
  }
  if (u.includes("scout") || u.includes("search") || u.includes("look")) {
    return "scout";
  }
  if (u.includes("stand down") || u.includes("idle") || u.includes("rest")) {
    return "custom";
  }
  return "custom";
}

function planFor(
  kind: ConstructKind,
  drones: number,
  force: number,
): ConstructPlan {
  switch (kind) {
    case "shield":
      return {
        kind,
        narration: "Circular shield formation — hard light stand-in.",
        formation: ring(drones, 2.5, 1.4),
        force,
      };
    case "beam":
      return {
        kind,
        narration: "Linear beam corridor — drones in a firing line.",
        formation: line(drones, 6, 1.8),
        force: Math.min(1, force + 0.1),
      };
    case "platform":
      return {
        kind,
        narration: "Flat platform lattice for lift / carry.",
        formation: ring(drones, 1.8, 0.8),
        payload: "platform",
        force,
      };
    case "grasp":
      return {
        kind,
        narration: "Converging grasp — surround and hold.",
        formation: ring(Math.max(3, drones), 1.2, 1.0),
        payload: "grasp",
        force,
      };
    case "scout":
      return {
        kind,
        narration: "Scout screen — fan out and report.",
        formation: line(drones, 8, 2.2),
        force: Math.max(0.2, force * 0.5),
      };
    default:
      return {
        kind: "custom",
        narration: "Holding pattern — awaiting clearer will.",
        formation: ring(drones, 1.0, 1.0),
        force: 0.2,
      };
  }
}

/**
 * Local rule brain — always-on voice of the ring without a network model.
 * Swap for an LLM / fine-tuned advisor when you want richer talk.
 */
export class LocalRingBrain implements RingBrain {
  constructor(private readonly droneCount = 6) {}

  async deliberate(intention: IntentionSignal): Promise<BrainReply> {
    const kind = parseKind(intention.utterance);
    const force = Math.min(1, Math.max(0.15, intention.strength));
    const plan = planFor(kind, this.droneCount, force);

    const voice =
      kind === "custom" && intention.utterance.toLowerCase().includes("stand")
        ? "Will acknowledged. Constructs standing down."
        : `Will received: "${intention.utterance}". Forming ${plan.kind}. ${plan.narration}`;

    return {
      plan,
      voice,
      confidence: Math.min(1, 0.55 + intention.strength * 0.4),
    };
  }
}

/**
 * Pluggable brain — call your own model / chat agent, return a ConstructPlan.
 */
export class DelegateBrain implements RingBrain {
  constructor(
    private readonly delegate: (intention: IntentionSignal) => Promise<BrainReply>,
  ) {}

  deliberate(intention: IntentionSignal): Promise<BrainReply> {
    return this.delegate(intention);
  }
}
