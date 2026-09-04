/**
 * One mission pulse: wearable will → ring brain → drone swarm construct.
 *
 * Run: npm run example
 */
import {
  DroneSwarmConstruct,
  LanternRing,
  LocalRingBrain,
  SimulatedEmgWill,
  TextWill,
} from "../src/index.js";

async function main() {
  console.log("═ Lanturn Light ═");
  console.log("A ring is three technologies stacked.\n");

  const swarm = new DroneSwarmConstruct(6);
  const brain = new LocalRingBrain(6);

  // 1) Text will (chat / voice STT stand-in)
  const byVoice = new LanternRing({
    will: new TextWill("form a shield around us", 0.92),
    brain,
    construct: swarm,
  });
  const shield = await byVoice.pulse();
  console.log("— will (text) —");
  console.log(shield.intention);
  console.log("— brain —");
  console.log(shield.brain.voice);
  console.log("— construct —");
  console.log({
    formation: shield.swarm.formationLabel,
    ready: shield.swarm.ready,
    drones: shield.swarm.drones.map((d) => ({
      id: d.id,
      status: d.status,
      pos: {
        x: Number(d.position.x.toFixed(2)),
        y: Number(d.position.y.toFixed(2)),
        z: Number(d.position.z.toFixed(2)),
      },
    })),
  });

  // 2) Simulated EMG band burst → grasp
  const byEmg = new LanternRing({
    will: new SimulatedEmgWill([0.4, 0.7, 0.35, 0.5]),
    brain,
    construct: swarm,
  });
  const grasp = await byEmg.pulse();
  console.log("\n— will (EMG sim) —");
  console.log(grasp.intention.utterance, `@${grasp.intention.strength}`);
  console.log("— brain —");
  console.log(grasp.brain.voice);
  console.log("— formation —", grasp.swarm.formationLabel);

  console.log("\n— physics note —");
  console.log(shield.physicsNote);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
