import type { RingBrain } from "./brain.js";
import type { ConstructField } from "./construct.js";
import type { MissionResult } from "./types.js";
import type { WillInterface } from "./will.js";

export const PHYSICS_GAP =
  "Force at a distance with nothing at the target is unsolved. Constructs need hardware in the field — today that hardware is the drone swarm.";

export interface LanternRingOptions {
  will: WillInterface;
  brain: RingBrain;
  construct: ConstructField;
}

/**
 * The ring — Will → Brain → Construct, in one pulse.
 */
export class LanternRing {
  constructor(private readonly opts: LanternRingOptions) {}

  /** Read will, deliberate, form the construct. */
  async pulse(): Promise<MissionResult> {
    const intention = await this.opts.will.read();
    const brain = await this.opts.brain.deliberate(intention);
    const swarm = await this.opts.construct.form(brain.plan);

    return {
      intention,
      brain,
      swarm,
      physicsNote: PHYSICS_GAP,
    };
  }

  /** Direct utterance without a Will adapter (dev / chat bridge). */
  async command(utterance: string, strength = 0.9): Promise<MissionResult> {
    const { TextWill } = await import("./will.js");
    const will = new TextWill(utterance, strength);
    const intention = await will.read();
    const brain = await this.opts.brain.deliberate(intention);
    const swarm = await this.opts.construct.form(brain.plan);
    return {
      intention,
      brain,
      swarm,
      physicsNote: PHYSICS_GAP,
    };
  }
}
