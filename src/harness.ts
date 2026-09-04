import { CalibrationTable, DEFAULT_CONFIDENCE_BUCKETS } from "./calibration.js";
import { DecisionJournal } from "./journal.js";
import type { JournalStore } from "./store.js";
import type {
  DecisionHarnessOptions,
  DecisionInputs,
  Direction,
  JournalEntry,
  ModelAdvisor,
  ModelConsultation,
  ParsedDecision,
  SignalType,
} from "./types.js";

const MS_DAY = 24 * 60 * 60 * 1000;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Weighted consensus across model consultations. */
export function consensusDecision(
  models: ModelConsultation[],
  weights: Record<string, number>,
  priorWeight: number,
): ParsedDecision {
  if (models.length === 0) {
    return {
      direction: "flat",
      confidence: 0,
      rationale: "No models consulted.",
    };
  }

  const score: Record<Direction, number> = { long: 0, short: 0, flat: 0 };
  let confSum = 0;
  let wSum = 0;
  const bits: string[] = [];

  for (const m of models) {
    const w = weights[m.modelId] ?? priorWeight;
    const c = clamp01(m.parsed.confidence);
    score[m.parsed.direction] += w * c;
    confSum += w * c;
    wSum += w;
    bits.push(
      `${m.modelId}=${m.parsed.direction}@${c.toFixed(2)}×${w.toFixed(2)}`,
    );
  }

  let direction: Direction = "flat";
  let best = -1;
  for (const d of ["long", "short", "flat"] as Direction[]) {
    if (score[d] > best) {
      best = score[d];
      direction = d;
    }
  }

  const confidence = wSum === 0 ? 0 : clamp01(confSum / wSum);
  return {
    direction,
    confidence,
    rationale: `Weighted consensus [${bits.join("; ")}] → ${direction}`,
  };
}

export interface DecideResult {
  entry: JournalEntry;
  decision: ParsedDecision;
  models: ModelConsultation[];
  modelWeights: Record<string, number>;
}

/**
 * Decision Harness — consult models, weight by calibration, journal the call.
 */
export class DecisionHarness {
  readonly journal: DecisionJournal;
  readonly calibration: CalibrationTable;
  private readonly horizonMs: number;
  private readonly minModelWeight: number;
  private readonly priorWeight: number;

  constructor(
    store: JournalStore,
    private readonly advisors: ModelAdvisor[],
    options: DecisionHarnessOptions = {},
  ) {
    this.journal = new DecisionJournal(store);
    this.calibration = new CalibrationTable(
      this.journal,
      options.confidenceBuckets ?? DEFAULT_CONFIDENCE_BUCKETS,
    );
    this.horizonMs = options.horizonMs ?? MS_DAY;
    this.minModelWeight = options.minModelWeight ?? 0.15;
    this.priorWeight = options.priorWeight ?? 1;
  }

  async decide(
    inputs: DecisionInputs,
    signalType: SignalType = "consensus",
  ): Promise<DecideResult> {
    const learned = await this.calibration.modelWeights({
      signalType,
      priorWeight: this.priorWeight,
      minWeight: this.minModelWeight,
    });

    // Ensure every live advisor has a weight (cold start).
    const modelWeights: Record<string, number> = { ...learned };
    for (const a of this.advisors) {
      if (modelWeights[a.modelId] === undefined) {
        modelWeights[a.modelId] = this.priorWeight;
      }
    }

    const models: ModelConsultation[] = [];
    for (const advisor of this.advisors) {
      const started = Date.now();
      const result = await advisor.consult(inputs, signalType);
      models.push({
        modelId: advisor.modelId,
        provider: advisor.provider,
        rawOutput: result.rawOutput,
        parsed: result.parsed,
        latencyMs: result.latencyMs ?? Date.now() - started,
      });
    }

    const decision = consensusDecision(
      models,
      modelWeights,
      this.priorWeight,
    );

    const entry = await this.journal.record({
      inputs,
      models,
      decision,
      modelWeights,
      signalType,
      horizonMs: this.horizonMs,
    });

    return { entry, decision, models, modelWeights };
  }
}
