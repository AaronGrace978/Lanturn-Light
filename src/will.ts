import type { IntentionSignal, IntentionSource } from "./types.js";

/**
 * Will layer — reads intention and turns it into a command signal.
 * Closest-to-done piece of a real ring (EMG / EEG prototypes exist today).
 */
export interface WillInterface {
  /** Capture one intention sample from the wearer. */
  read(): Promise<IntentionSignal>;
}

/** Text / CLI will — you type the command; the ring obeys. */
export class TextWill implements WillInterface {
  constructor(
    private readonly utterance: string,
    private readonly strength = 0.9,
  ) {}

  async read(): Promise<IntentionSignal> {
    return {
      source: "text",
      utterance: this.utterance,
      strength: this.strength,
      at: new Date().toISOString(),
    };
  }
}

/**
 * Simulated EMG band — channel bursts map to canned intents.
 * Swap this for a real serial/BLE EMG adapter later.
 */
export class SimulatedEmgWill implements WillInterface {
  constructor(
    private readonly channels: number[],
    private readonly lexicon: Record<string, string> = {
      fist: "form a shield",
      open: "stand down",
      point: "scout ahead",
      pinch: "grasp the target",
    },
  ) {}

  private classify(): string {
    const peak = Math.max(...this.channels, 0);
    const mean =
      this.channels.length === 0
        ? 0
        : this.channels.reduce((a, b) => a + b, 0) / this.channels.length;
    if (peak > 0.85 && mean > 0.5) return this.lexicon.fist ?? "form a shield";
    if (peak < 0.2) return this.lexicon.open ?? "stand down";
    if (this.channels[0]! > this.channels[1]!) {
      return this.lexicon.point ?? "scout ahead";
    }
    return this.lexicon.pinch ?? "grasp the target";
  }

  async read(): Promise<IntentionSignal> {
    const utterance = this.classify();
    const strength = Math.min(
      1,
      Math.max(0, Math.max(...this.channels, 0.3)),
    );
    return {
      source: "emg" satisfies IntentionSource,
      utterance,
      strength,
      channels: [...this.channels],
      at: new Date().toISOString(),
    };
  }
}

/** Wrap any async utterance producer (voice STT, BLE EMG, etc.). */
export class AdapterWill implements WillInterface {
  constructor(
    private readonly source: IntentionSource,
    private readonly sample: () => Promise<{
      utterance: string;
      strength?: number;
      channels?: number[];
    }>,
  ) {}

  async read(): Promise<IntentionSignal> {
    const s = await this.sample();
    return {
      source: this.source,
      utterance: s.utterance,
      strength: s.strength ?? 0.7,
      channels: s.channels,
      at: new Date().toISOString(),
    };
  }
}
