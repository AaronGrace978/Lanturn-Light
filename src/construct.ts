import type {
  ConstructPlan,
  DroneState,
  SwarmSnapshot,
  Vec3,
} from "./types.js";

function dist(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.hypot(dx, dy, dz);
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

export interface ConstructField {
  /** Shape the swarm into the planned construct. */
  form(plan: ConstructPlan): Promise<SwarmSnapshot>;
  snapshot(): SwarmSnapshot;
}

/**
 * Drone swarm constructs — the honest hard-light stand-in.
 * Drones ARE the construct: will-commanded, formation-formed, mission-executed.
 *
 * They can shape-shift, carry, and (with hardware) project light.
 * They cannot push with nothing at the target — that's still ring magic.
 */
export class DroneSwarmConstruct implements ConstructField {
  private drones: DroneState[];
  private formationLabel = "idle";

  constructor(count = 6) {
    this.drones = Array.from({ length: count }, (_, i) => ({
      id: `drone-${i + 1}`,
      position: { x: i * 0.4, y: 0, z: 0.5 },
      target: null,
      status: "idle" as const,
    }));
  }

  snapshot(): SwarmSnapshot {
    const ready = this.drones.every(
      (d) => d.status === "holding" || d.status === "idle",
    );
    return {
      drones: this.drones.map((d) => ({ ...d, position: { ...d.position } })),
      formationLabel: this.formationLabel,
      ready,
    };
  }

  async form(plan: ConstructPlan): Promise<SwarmSnapshot> {
    this.formationLabel = plan.kind;
    const slots = plan.formation;
    const n = Math.min(this.drones.length, slots.length || this.drones.length);

    for (let i = 0; i < this.drones.length; i++) {
      const drone = this.drones[i]!;
      if (i >= n || slots.length === 0) {
        drone.target = null;
        drone.status = "idle";
        continue;
      }
      drone.target = { ...slots[i % slots.length]! };
      drone.status = "forming";
    }

    // Simulate flight: step toward targets.
    const steps = 8;
    for (let s = 0; s < steps; s++) {
      for (const drone of this.drones) {
        if (!drone.target) continue;
        const t = Math.min(1, (s + 1) / steps) * (0.5 + plan.force * 0.5);
        drone.position = lerp(drone.position, drone.target, t);
        if (dist(drone.position, drone.target) < 0.05) {
          drone.position = { ...drone.target };
          drone.status = "holding";
        } else {
          drone.status = "mission";
        }
      }
    }

    for (const drone of this.drones) {
      if (drone.target && dist(drone.position, drone.target) < 0.08) {
        drone.status = "holding";
      }
    }

    return this.snapshot();
  }
}

/**
 * Stub for future optical-tweezer / acoustic / plasma projectors.
 * Documents the physics wall without pretending it's solved.
 */
export class HardLightStub implements ConstructField {
  snapshot(): SwarmSnapshot {
    return { drones: [], formationLabel: "unimplemented", ready: false };
  }

  async form(_plan: ConstructPlan): Promise<SwarmSnapshot> {
    throw new Error(
      "Hard-light force at a distance with no hardware at the target is unsolved physics. Use DroneSwarmConstruct.",
    );
  }
}
