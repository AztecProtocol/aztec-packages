import { DataStore } from '../data_store.js';
import levelup, { LevelUp } from 'levelup';
import leveldown from 'leveldown';
import memdown from 'memdown';

/**
 * Cache for data used by wasm module
 */
export class NodeDataStore implements DataStore {
  private db: LevelUp;

  // eslint-disable-next-line
  constructor(path?: string) {
    // Hack: Cast as any to work around packages "broken" with node16 resolution
    // See https://github.com/microsoft/TypeScript/issues/49160
    this.db = levelup(path ? (leveldown as any)(path) : (memdown as any)());
  }

  async get(key: string): Promise<Buffer | undefined> {
    return await this.db.get(key).catch(() => {});
  }

  async set(key: string, value: Buffer): Promise<void> {
    await this.db.put(key, value);
  }
}
