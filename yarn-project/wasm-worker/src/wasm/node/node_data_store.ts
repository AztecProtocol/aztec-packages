import { DataStore } from '../data_store.js';
import { default as levelup, LevelUp } from 'levelup';
// import { default as leveldown } from 'leveldown';
import { default as memdown } from 'memdown';

export class NodeDataStore implements DataStore {
  private db: LevelUp;

  // eslint-disable-next-line
  constructor(path?: string) {
    // LevelDown seemingly doesn't want to webpack... Fix.
    // this.db = levelup(path ? leveldown(path) : memdown());
    this.db = levelup(memdown());
  }

  async get(key: string): Promise<Buffer | undefined> {
    return await this.db.get(key).catch(() => {});
  }

  async set(key: string, value: Buffer): Promise<void> {
    await this.db.put(key, value);
  }
}
