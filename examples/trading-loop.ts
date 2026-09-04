/**
 * Toy trading loop — two stub "frontier" models, journal → reconcile → calibrate → reweight.
 *
 * Run: npm run example
 */
import {
  DecisionHarness,
  FileJournalStore,
  OutcomeReconciler,
  type ModelAdvisor,
  type PriceOracle,
} from "../src/index.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data", "journal");

/** Price history keyed by ISO timestamp for deterministic reconcile. */
const history: { at: string; price: number }[] = [
  { at: new Date(0).toISOString(), price: 140 },
];

function setPrice(price: number, at = new Date()): void {
  history.push({ at: at.toISOString(), price });
  history.sort((a, b) => a.at.localeCompare(b.at));
}

function priceAt(at: string): number {
  const t = new Date(at).getTime();
  let price = history[0]!.price;
  for (const h of history) {
    if (new Date(h.at).getTime() <= t) price = h.price;
    else break;
  }
  return price;
}

const oracle: PriceOracle = {
  async getPrice(_symbol, at) {
    return priceAt(at);
  },
};

function model(
  modelId: string,
  bias: "long" | "short",
  confidence: number,
): ModelAdvisor {
  return {
    modelId,
    provider: "demo",
    async consult(inputs) {
      const parsed = {
        direction: bias as "long" | "short",
        confidence,
        rationale: `${modelId} bias=${bias} on ${inputs.symbol ?? "?"}`,
      };
      return { rawOutput: JSON.stringify(parsed), parsed };
    },
  };
}

async function main() {
  await rm(dataDir, { recursive: true, force: true });

  const store = new FileJournalStore(dataDir);
  const harness = new DecisionHarness(
    store,
    [model("emerald", "long", 0.82), model("yellow", "short", 0.78)],
    { horizonMs: 50, minModelWeight: 0.2 },
  );

  console.log("— decide (cold start, equal prior weights) —");
  const first = await harness.decide(
    {
      symbol: "SOL",
      newsHeadlines: ["ETF inflows tick up"],
      whaleTransfers: [{ amount: 12_000, side: "buy" }],
      marketSnapshot: { price: priceAt(new Date().toISOString()) },
    },
    "news",
  );
  console.log(first.decision);
  console.log("weights:", first.modelWeights);

  // Price move lands at the decision horizon (not after it).
  setPrice(148, new Date(first.entry.horizonAt));
  await new Promise((r) => setTimeout(r, 60));

  const reconciler = new OutcomeReconciler(harness.journal, oracle);
  const { reconciled } = await reconciler.reconcileDue();
  console.log("\n— reconciled —");
  for (const e of reconciled) {
    console.log({
      id: e.id.slice(0, 8),
      decision: e.decision.direction,
      hit: e.outcome?.hit,
      pnl: e.outcome?.realizedPnl,
    });
  }

  for (let i = 0; i < 5; i++) {
    const { entry } = await harness.decide(
      {
        symbol: "SOL",
        marketSnapshot: { price: priceAt(new Date().toISOString()) },
      },
      "news",
    );
    const prev = priceAt(entry.timestamp);
    setPrice(prev * 1.01, new Date(entry.horizonAt));
    await new Promise((r) => setTimeout(r, 60));
    await reconciler.reconcileDue();
  }

  const table = await harness.calibration.build("news");
  console.log("\n— calibration —");
  console.table(
    table.map((r) => ({
      model: r.modelId,
      bucket: r.bucket,
      n: r.decisions,
      winRate: Number(r.winRate.toFixed(2)),
      pnl: Number(r.totalPnl.toFixed(2)),
    })),
  );

  const weights = await harness.calibration.modelWeights({
    signalType: "news",
    minSamples: 3,
  });
  console.log("\n— next-round weights (accuracy-aware) —");
  console.log(weights);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
