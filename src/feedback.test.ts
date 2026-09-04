import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CalibrationTable,
  DecisionHarness,
  MemoryJournalStore,
  OutcomeReconciler,
  type ModelAdvisor,
  type PriceOracle,
} from "./index.js";

function stubAdvisor(
  modelId: string,
  direction: "long" | "short" | "flat",
  confidence: number,
): ModelAdvisor {
  return {
    modelId,
    provider: "stub",
    async consult() {
      return {
        rawOutput: JSON.stringify({ direction, confidence }),
        parsed: {
          direction,
          confidence,
          rationale: `${modelId} says ${direction}`,
        },
      };
    },
  };
}

describe("Lanturn Light feedback loop", () => {
  it("journals a decision with null outcome", async () => {
    const store = new MemoryJournalStore();
    const harness = new DecisionHarness(
      store,
      [stubAdvisor("alpha", "long", 0.8)],
      { horizonMs: 1000 },
    );

    const { entry } = await harness.decide(
      { symbol: "BTC", marketSnapshot: { price: 100 } },
      "technical",
    );

    assert.equal(entry.outcome, null);
    assert.equal(entry.decision.direction, "long");
    assert.ok(entry.models.length === 1);
  });

  it("reconciles after horizon and calibrates weights", async () => {
    const store = new MemoryJournalStore();
    const harness = new DecisionHarness(
      store,
      [
        stubAdvisor("smart", "long", 0.9),
        stubAdvisor("dumb", "short", 0.9),
      ],
      { horizonMs: 1, minModelWeight: 0.15, priorWeight: 1 },
    );

    // Seed enough history so weights leave prior.
    for (let i = 0; i < 6; i++) {
      await harness.decide(
        { symbol: "ETH", marketSnapshot: { price: 100 + i } },
        "news",
      );
    }

    // Force horizons into the past relative to each entry's timestamp.
    const entries = await harness.journal.list();
    for (const e of entries) {
      const t0 = new Date(e.timestamp).getTime();
      e.timestamp = new Date(t0 - 60_000).toISOString();
      e.horizonAt = new Date(t0 - 30_000).toISOString();
      await harness.journal.update(e);
    }

    const oracle: PriceOracle = {
      async getPrice(_symbol, at) {
        // Monotone rising series keyed by wall time → long is correct.
        const t = new Date(at).getTime();
        return 100 + (t % 1_000_000) / 1000;
      },
    };

    const reconciler = new OutcomeReconciler(harness.journal, oracle);
    const { reconciled } = await reconciler.reconcileDue();
    assert.ok(reconciled.length >= 6);
    assert.ok(reconciled.every((e) => e.outcome !== null));

    const cal = new CalibrationTable(harness.journal);
    const rows = await cal.build("news");
    assert.ok(rows.length > 0);

    const weights = await cal.modelWeights({
      signalType: "news",
      minSamples: 5,
      minWeight: 0.15,
    });
    assert.ok(weights.smart !== undefined);
    assert.ok(weights.dumb !== undefined);
    // smart called long on rising market; dumb called short.
    assert.ok(weights.smart! >= weights.dumb!);
  });
});
