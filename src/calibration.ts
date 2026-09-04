import type { DecisionJournal } from "./journal.js";
import type {
  CalibrationRow,
  ConfidenceBucket,
  JournalEntry,
  SignalType,
} from "./types.js";

export const DEFAULT_CONFIDENCE_BUCKETS: ConfidenceBucket[] = [
  { min: 0, max: 0.5, label: "0-50" },
  { min: 0.5, max: 0.7, label: "50-70" },
  { min: 0.7, max: 0.85, label: "70-85" },
  { min: 0.85, max: 1.0001, label: "85-100" },
];

function bucketFor(
  confidence: number,
  buckets: ConfidenceBucket[],
): ConfidenceBucket {
  const c = Math.min(1, Math.max(0, confidence));
  for (const b of buckets) {
    if (c >= b.min && c < b.max) return b;
  }
  return buckets[buckets.length - 1]!;
}

function modelHit(entry: JournalEntry, modelId: string): boolean | null {
  if (!entry.outcome) return null;
  const m = entry.models.find((x) => x.modelId === modelId);
  if (!m) return null;
  const decided = m.parsed.direction;
  const r = entry.outcome.realizedReturn;
  if (decided === "flat") return Math.abs(r) < 1e-6;
  if (decided === "long") return r > 0;
  return r < 0;
}

/**
 * Calibration Table — win rate by model × signal type × confidence bucket.
 */
export class CalibrationTable {
  constructor(
    private readonly journal: DecisionJournal,
    private readonly buckets: ConfidenceBucket[] = DEFAULT_CONFIDENCE_BUCKETS,
  ) {}

  async build(signalType?: SignalType): Promise<CalibrationRow[]> {
    const entries = (await this.journal.list()).filter((e) => e.outcome);
    const filtered = signalType
      ? entries.filter((e) => e.signalType === signalType)
      : entries;

    type Acc = {
      modelId: string;
      signalType: SignalType;
      bucket: string;
      decisions: number;
      hits: number;
      confSum: number;
      totalPnl: number;
    };

    const map = new Map<string, Acc>();

    for (const entry of filtered) {
      for (const m of entry.models) {
        const hit = modelHit(entry, m.modelId);
        if (hit === null) continue;
        const b = bucketFor(m.parsed.confidence, this.buckets);
        const key = `${m.modelId}::${entry.signalType}::${b.label}`;
        let acc = map.get(key);
        if (!acc) {
          acc = {
            modelId: m.modelId,
            signalType: entry.signalType,
            bucket: b.label,
            decisions: 0,
            hits: 0,
            confSum: 0,
            totalPnl: 0,
          };
          map.set(key, acc);
        }
        acc.decisions += 1;
        if (hit) acc.hits += 1;
        acc.confSum += m.parsed.confidence;
        // Equal share of entry P&L for a rough model scoreboard.
        acc.totalPnl +=
          entry.models.length === 0
            ? 0
            : entry.outcome!.realizedPnl / entry.models.length;
      }
    }

    return [...map.values()]
      .map(
        (a): CalibrationRow => ({
          modelId: a.modelId,
          signalType: a.signalType,
          bucket: a.bucket,
          decisions: a.decisions,
          hits: a.hits,
          winRate: a.decisions === 0 ? 0 : a.hits / a.decisions,
          avgConfidence: a.decisions === 0 ? 0 : a.confSum / a.decisions,
          totalPnl: a.totalPnl,
        }),
      )
      .sort((a, b) =>
        a.modelId === b.modelId
          ? a.signalType === b.signalType
            ? a.bucket.localeCompare(b.bucket)
            : String(a.signalType).localeCompare(String(b.signalType))
          : a.modelId.localeCompare(b.modelId),
      );
  }

  /**
   * Accuracy weight per model for the next decision (demonstrated win rate).
   * Cold models get `priorWeight`; proven losers approach `minWeight`.
   */
  async modelWeights(options?: {
    signalType?: SignalType;
    priorWeight?: number;
    minWeight?: number;
    /** Minimum resolved decisions before trusting empirical rate. */
    minSamples?: number;
  }): Promise<Record<string, number>> {
    const prior = options?.priorWeight ?? 1;
    const minW = options?.minWeight ?? 0.15;
    const minSamples = options?.minSamples ?? 5;
    const rows = await this.build(options?.signalType);

    const byModel = new Map<string, { hits: number; n: number }>();
    for (const r of rows) {
      const cur = byModel.get(r.modelId) ?? { hits: 0, n: 0 };
      cur.hits += r.hits;
      cur.n += r.decisions;
      byModel.set(r.modelId, cur);
    }

    const weights: Record<string, number> = {};
    for (const [modelId, { hits, n }] of byModel) {
      if (n < minSamples) {
        weights[modelId] = prior;
        continue;
      }
      const rate = hits / n;
      weights[modelId] = Math.max(minW, rate);
    }
    return weights;
  }
}
