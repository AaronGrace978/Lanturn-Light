# Lanturn Light

Decision harness with an **outcome feedback loop** — so model consensus learns from what actually happened, not what sounded smartest.

Inspired by the idea of a lantern that only stays lit when it *works*: journal every call, reconcile after the horizon, calibrate by model × signal × confidence, then reweight the next decision.

## Loop

1. **Decision Journal** — every harness call persists timestamp, inputs (whales, headlines, market snapshot), model raw outputs, parsed decision, and `outcome: null`.
2. **Outcome Reconciler** — after the horizon (default 24h), pull the real price move and backfill hit/miss + realized P&L.
3. **Calibration Table** — aggregate win rate by model, signal type, and confidence bucket.
4. **Harness Weighting** — before the next decision, weight model consensus by demonstrated accuracy. Persistent losers lose equal say.

Build order that matters: journal → reconciler → calibration → weighting.

## Install

```bash
npm install
npm run build
```

## Quick start

```ts
import {
  DecisionHarness,
  FileJournalStore,
  OutcomeReconciler,
  type ModelAdvisor,
  type PriceOracle,
} from "lanturn-light";

const advisors: ModelAdvisor[] = [
  {
    modelId: "emerald",
    async consult(inputs) {
      // call your frontier provider here
      return {
        rawOutput: "...",
        parsed: {
          direction: "long",
          confidence: 0.8,
          rationale: "whale + news aligned",
        },
      };
    },
  },
];

const harness = new DecisionHarness(new FileJournalStore("./data/journal"), advisors, {
  horizonMs: 24 * 60 * 60 * 1000,
});

const { decision, entry } = await harness.decide(
  {
    symbol: "BTC",
    newsHeadlines: ["..."],
    whaleTransfers: [],
    marketSnapshot: { price: 64000 },
  },
  "news",
);

// later — scheduled job
const oracle: PriceOracle = {
  async getPrice(symbol, at) {
    /* your market data */
    return 0;
  },
};
await new OutcomeReconciler(harness.journal, oracle).reconcileDue();
const weights = await harness.calibration.modelWeights({ signalType: "news" });
```

## Scripts

| Script | What |
|--------|------|
| `npm run build` | Compile to `dist/` |
| `npm run check` | Typecheck only |
| `npm test` | Node test runner |
| `npm run example` | Toy trading loop (file journal under `data/`) |

## Repo

https://github.com/AaronGrace978/Lanturn-Light
