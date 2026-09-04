/**
 * Core domain types for Lanturn Light — the decision feedback loop.
 */

/** Market / signal context the harness saw when it decided. */
export interface DecisionInputs {
  /** Optional symbol or instrument. */
  symbol?: string;
  /** Whale / large transfers, order-flow notes, etc. */
  whaleTransfers?: unknown[];
  /** Headlines or news snippets at decision time. */
  newsHeadlines?: string[];
  /** Price / volume / indicator snapshot. */
  marketSnapshot?: Record<string, unknown>;
  /** Free-form extra context. */
  extra?: Record<string, unknown>;
}

export type Direction = "long" | "short" | "flat";

export interface ParsedDecision {
  direction: Direction;
  /** 0–1 confidence from the model or consensus. */
  confidence: number;
  rationale: string;
  /** Optional size hint (fraction of risk budget). */
  size?: number;
}

export interface ModelConsultation {
  modelId: string;
  provider?: string;
  /** Raw provider output before parsing. */
  rawOutput: string;
  parsed: ParsedDecision;
  /** Wall time for this call, if known. */
  latencyMs?: number;
}

export type SignalType =
  | "whale"
  | "news"
  | "technical"
  | "consensus"
  | "custom"
  | string;

export interface DecisionOutcome {
  /** Whether direction matched realized move (flat = miss if move ≠ 0). */
  hit: boolean;
  /** Realized P&L in quote currency (or unitless points). */
  realizedPnl: number;
  /** Price at decision time. */
  entryPrice: number;
  /** Price at horizon. */
  exitPrice: number;
  /** Actual return over the horizon (e.g. 0.02 = +2%). */
  realizedReturn: number;
  reconciledAt: string;
}

export interface JournalEntry {
  id: string;
  timestamp: string;
  /** When outcome should be evaluated (ISO). */
  horizonAt: string;
  signalType: SignalType;
  inputs: DecisionInputs;
  models: ModelConsultation[];
  /** Final harness decision after weighting / consensus. */
  decision: ParsedDecision;
  /** Weights applied to each model at decision time. */
  modelWeights: Record<string, number>;
  outcome: DecisionOutcome | null;
}

export interface ConfidenceBucket {
  /** Inclusive lower bound, exclusive upper (last bucket inclusive). */
  min: number;
  max: number;
  label: string;
}

export interface CalibrationRow {
  modelId: string;
  signalType: SignalType;
  bucket: string;
  decisions: number;
  hits: number;
  winRate: number;
  avgConfidence: number;
  totalPnl: number;
}

export interface PricePoint {
  symbol: string;
  price: number;
  at: string;
}

export interface DecisionHarnessOptions {
  /** Horizon length in ms (default 24h). */
  horizonMs?: number;
  /** Confidence bucket edges (default 0.5 / 0.7 / 0.85 / 1). */
  confidenceBuckets?: ConfidenceBucket[];
  /** Floor weight so a cold model still gets a vote. */
  minModelWeight?: number;
  /** Prior weight before any outcomes exist. */
  priorWeight?: number;
}

export interface ModelAdvisor {
  modelId: string;
  provider?: string;
  consult(inputs: DecisionInputs, signalType: SignalType): Promise<{
    rawOutput: string;
    parsed: ParsedDecision;
    latencyMs?: number;
  }>;
}

export interface PriceOracle {
  getPrice(symbol: string, at: string): Promise<number>;
}
