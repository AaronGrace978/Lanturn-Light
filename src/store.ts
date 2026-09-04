import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JournalEntry } from "./types.js";

export interface JournalStore {
  save(entry: JournalEntry): Promise<void>;
  get(id: string): Promise<JournalEntry | null>;
  list(): Promise<JournalEntry[]>;
}

/** In-memory store — tests and demos. */
export class MemoryJournalStore implements JournalStore {
  private readonly byId = new Map<string, JournalEntry>();

  async save(entry: JournalEntry): Promise<void> {
    this.byId.set(entry.id, structuredClone(entry));
  }

  async get(id: string): Promise<JournalEntry | null> {
    const e = this.byId.get(id);
    return e ? structuredClone(e) : null;
  }

  async list(): Promise<JournalEntry[]> {
    return [...this.byId.values()]
      .map((e) => structuredClone(e))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
}

/**
 * JSON-file journal under a directory (one file per entry + index).
 * Good default for local / Steam Deck style workflows.
 */
export class FileJournalStore implements JournalStore {
  private readonly dir: string;
  private readonly indexPath: string;

  constructor(dir: string) {
    this.dir = dir;
    this.indexPath = path.join(dir, "index.json");
  }

  private entryPath(id: string): string {
    return path.join(this.dir, "entries", `${id}.json`);
  }

  private async ensure(): Promise<void> {
    await mkdir(path.join(this.dir, "entries"), { recursive: true });
  }

  private async readIndex(): Promise<string[]> {
    try {
      const raw = await readFile(this.indexPath, "utf8");
      const parsed = JSON.parse(raw) as { ids?: string[] };
      return parsed.ids ?? [];
    } catch {
      return [];
    }
  }

  private async writeIndex(ids: string[]): Promise<void> {
    const tmp = `${this.indexPath}.tmp`;
    await writeFile(tmp, JSON.stringify({ ids }, null, 2), "utf8");
    await rename(tmp, this.indexPath);
  }

  async save(entry: JournalEntry): Promise<void> {
    await this.ensure();
    const tmp = `${this.entryPath(entry.id)}.tmp`;
    await writeFile(tmp, JSON.stringify(entry, null, 2), "utf8");
    await rename(tmp, this.entryPath(entry.id));

    const ids = await this.readIndex();
    if (!ids.includes(entry.id)) {
      ids.push(entry.id);
      await this.writeIndex(ids);
    }
  }

  async get(id: string): Promise<JournalEntry | null> {
    try {
      const raw = await readFile(this.entryPath(id), "utf8");
      return JSON.parse(raw) as JournalEntry;
    } catch {
      return null;
    }
  }

  async list(): Promise<JournalEntry[]> {
    const ids = await this.readIndex();
    const entries: JournalEntry[] = [];
    for (const id of ids) {
      const e = await this.get(id);
      if (e) entries.push(e);
    }
    return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
}
