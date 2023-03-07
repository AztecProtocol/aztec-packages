import { DataStore } from '../data_store.js';
import { default as levelup, LevelUp } from 'levelup';
import { default as memdown } from 'memdown';

export class WebDataStore implements DataStore {
  private db: LevelUp;

  constructor() {
    // TODO: The whole point of this is to reduce memory load in the browser.
    // Replace with leveljs so the data is stored in indexeddb and not in memory.
    this.db = levelup(memdown());
  }

  async get(key: string): Promise<Buffer | undefined> {
    return await this.db.get(key).catch(() => {});
  }

  async set(key: string, value: Buffer): Promise<void> {
    await this.db.put(key, value);
  }
}
