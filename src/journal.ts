import { randomUUID } from "node:crypto";
import type {
  DecisionInputs,
  JournalEntry,
  ModelConsultation,
  ParsedDecision,
  SignalType,
} from "./types.js";
import type { JournalStore } from "./store.js";

export interface RecordDecisionParams {
  inputs: DecisionInputs;
  models: ModelConsultation[];
  decision: ParsedDecision;
  modelWeights: Record<string, number>;
  signalType?: SignalType;
  /** Horizon length in ms from now. */
  horizonMs: number;
  timestamp?: Date;
  id?: string;
}

/**
 * Decision Journal — persist every harness call with outcome left null.
 */
export class DecisionJournal {
  constructor(private readonly store: JournalStore) {}

  async record(params: RecordDecisionParams): Promise<JournalEntry> {
    const timestamp = (params.timestamp ?? new Date()).toISOString();
    const horizonAt = new Date(
      new Date(timestamp).getTime() + params.horizonMs,
    ).toISOString();

    const entry: JournalEntry = {
      id: params.id ?? randomUUID(),
      timestamp,
      horizonAt,
      signalType: params.signalType ?? "consensus",
      inputs: params.inputs,
      models: params.models,
      decision: params.decision,
      modelWeights: params.modelWeights,
      outcome: null,
    };

    await this.store.save(entry);
    return entry;
  }

  async get(id: string): Promise<JournalEntry | null> {
    return this.store.get(id);
  }

  async list(): Promise<JournalEntry[]> {
    return this.store.list();
  }

  async pending(now = new Date()): Promise<JournalEntry[]> {
    const all = await this.store.list();
    const t = now.getTime();
    return all.filter(
      (e) => e.outcome === null && new Date(e.horizonAt).getTime() <= t,
    );
  }

  async update(entry: JournalEntry): Promise<void> {
    await this.store.save(entry);
  }
}
