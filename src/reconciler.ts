import type { DecisionJournal } from "./journal.js";
import type {
  DecisionOutcome,
  Direction,
  JournalEntry,
  PriceOracle,
} from "./types.js";

function directionFromReturn(realizedReturn: number, eps = 1e-6): Direction {
  if (realizedReturn > eps) return "long";
  if (realizedReturn < -eps) return "short";
  return "flat";
}

function isHit(decision: Direction, realizedReturn: number): boolean {
  const actual = directionFromReturn(realizedReturn);
  if (decision === "flat") return actual === "flat";
  return decision === actual;
}

function signedPnl(
  direction: Direction,
  entryPrice: number,
  exitPrice: number,
  size = 1,
): number {
  if (direction === "flat") return 0;
  const move = exitPrice - entryPrice;
  return direction === "long" ? move * size : -move * size;
}

export interface ReconcileResult {
  reconciled: JournalEntry[];
  skipped: JournalEntry[];
}

/**
 * Outcome Reconciler — after each decision's horizon, backfill hit/miss + P&L.
 */
export class OutcomeReconciler {
  constructor(
    private readonly journal: DecisionJournal,
    private readonly oracle: PriceOracle,
  ) {}

  async reconcileDue(now = new Date()): Promise<ReconcileResult> {
    const pending = await this.journal.pending(now);
    const reconciled: JournalEntry[] = [];
    const skipped: JournalEntry[] = [];

    for (const entry of pending) {
      const symbol = entry.inputs.symbol;
      if (!symbol) {
        skipped.push(entry);
        continue;
      }

      try {
        const entryPrice = await this.oracle.getPrice(symbol, entry.timestamp);
        const exitPrice = await this.oracle.getPrice(symbol, entry.horizonAt);
        const realizedReturn =
          entryPrice === 0 ? 0 : (exitPrice - entryPrice) / entryPrice;
        const size = entry.decision.size ?? 1;

        const outcome: DecisionOutcome = {
          hit: isHit(entry.decision.direction, realizedReturn),
          realizedPnl: signedPnl(
            entry.decision.direction,
            entryPrice,
            exitPrice,
            size,
          ),
          entryPrice,
          exitPrice,
          realizedReturn,
          reconciledAt: now.toISOString(),
        };

        const updated: JournalEntry = { ...entry, outcome };
        await this.journal.update(updated);
        reconciled.push(updated);
      } catch {
        skipped.push(entry);
      }
    }

    return { reconciled, skipped };
  }
}
