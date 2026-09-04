import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DroneSwarmConstruct,
  HardLightStub,
  LanternRing,
  LocalRingBrain,
  SimulatedEmgWill,
  TextWill,
} from "./index.js";

describe("Lanturn Light ring", () => {
  it("pulses Will → Brain → Construct", async () => {
    const ring = new LanternRing({
      will: new TextWill("form a shield", 0.95),
      brain: new LocalRingBrain(6),
      construct: new DroneSwarmConstruct(6),
    });

    const result = await ring.pulse();
    assert.equal(result.brain.plan.kind, "shield");
    assert.equal(result.swarm.formationLabel, "shield");
    assert.equal(result.swarm.drones.length, 6);
    assert.ok(result.swarm.drones.some((d) => d.status === "holding"));
    assert.ok(result.brain.voice.toLowerCase().includes("shield"));
  });

  it("maps EMG fist burst to shield intention", async () => {
    const will = new SimulatedEmgWill([0.9, 0.88, 0.92, 0.85]);
    const signal = await will.read();
    assert.equal(signal.source, "emg");
    assert.match(signal.utterance, /shield/i);
  });

  it("refuses fake hard-light force-at-a-distance", async () => {
    const stub = new HardLightStub();
    await assert.rejects(() =>
      stub.form({
        kind: "beam",
        narration: "nope",
        formation: [],
        force: 1,
      }),
    );
  });

  it("commands scout formation via ring.command", async () => {
    const ring = new LanternRing({
      will: new TextWill("idle"),
      brain: new LocalRingBrain(4),
      construct: new DroneSwarmConstruct(4),
    });
    const result = await ring.command("scout ahead");
    assert.equal(result.brain.plan.kind, "scout");
    assert.equal(result.swarm.drones.length, 4);
  });
});
