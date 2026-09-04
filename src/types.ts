/**
 * A ring is three technologies stacked.
 *
 * 1. Will  — intention → command (EMG / BCI / voice / gesture)
 * 2. Brain — AI that advises, plans, and talks back
 * 3. Construct — effectors in the world (today: drone swarm)
 *
 * True hard-light (force at a distance with nothing at the target)
 * is the unsolved physics gap. Everything else is a build plan.
 */

/** 3D point in ring-local meters. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type IntentionSource = "emg" | "eeg" | "voice" | "gesture" | "text" | "sim";

/** Raw will signal before the ring interprets it. */
export interface IntentionSignal {
  source: IntentionSource;
  /** Free-text or transcribed intent, e.g. "form a shield". */
  utterance: string;
  /** 0–1 strength of the will reading. */
  strength: number;
  /** Optional muscle / channel samples for EMG adapters. */
  channels?: number[];
  at: string;
}

export type ConstructKind =
  | "shield"
  | "beam"
  | "platform"
  | "grasp"
  | "scout"
  | "custom";

/** What the brain decided the construct should be. */
export interface ConstructPlan {
  kind: ConstructKind;
  /** Human-readable mission the brain will narrate. */
  narration: string;
  /** Target formation points for swarm drones. */
  formation: Vec3[];
  /** Optional payload hint (carry / project / hold). */
  payload?: string;
  /** How hard to push (maps to thruster / aggression budget). */
  force: number;
}

export interface BrainReply {
  plan: ConstructPlan;
  /** Spoken / text voice of the ring. */
  voice: string;
  confidence: number;
}

export type DroneStatus = "idle" | "forming" | "holding" | "mission" | "fault";

export interface DroneState {
  id: string;
  position: Vec3;
  target: Vec3 | null;
  status: DroneStatus;
}

export interface SwarmSnapshot {
  drones: DroneState[];
  formationLabel: string;
  ready: boolean;
}

export interface MissionResult {
  intention: IntentionSignal;
  brain: BrainReply;
  swarm: SwarmSnapshot;
  /** Honest: true force-at-a-distance without hardware is still impossible. */
  physicsNote: string;
}
