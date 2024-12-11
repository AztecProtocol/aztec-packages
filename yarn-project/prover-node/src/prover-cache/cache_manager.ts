import { type ProverCache } from '@aztec/circuit-types';
import { createLogger } from '@aztec/foundation/log';
import { AztecLmdbStore } from '@aztec/kv-store/lmdb';
import { InMemoryProverCache } from '@aztec/prover-client';

import { type Dirent } from 'fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';

import { KVProverCache } from './kv_cache.js';

const EPOCH_DIR_PREFIX = 'epoch';
const EPOCH_DIR_SEPARATOR = '_';
const EPOCH_HASH_FILENAME = 'epoch_hash.txt';

export class ProverCacheManager {
  constructor(private cacheDir?: string, private log = createLogger('prover-node:cache-manager')) {}

  public async openCache(epochNumber: bigint, epochHash: Buffer): Promise<ProverCache> {
    if (!this.cacheDir) {
      return new InMemoryProverCache();
    }

    const epochDir = EPOCH_DIR_PREFIX + EPOCH_DIR_SEPARATOR + epochNumber;
    const dataDir = join(this.cacheDir, epochDir);

    const storedEpochHash = await readFile(join(dataDir, EPOCH_HASH_FILENAME), 'hex').catch(() => Buffer.alloc(0));
    if (storedEpochHash.toString() !== epochHash.toString()) {
      await rm(dataDir, { recursive: true, force: true });
    }

    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, EPOCH_HASH_FILENAME), epochHash.toString('hex'));

    const store = AztecLmdbStore.open(dataDir);
    this.log.debug(`Created new database for epoch ${epochNumber} at ${dataDir}`);
    const cleanup = () => store.close();
    return new KVProverCache(store, cleanup);
  }

  /**
   * Removes all caches for epochs older than the given epoch (including)
   * @param upToAndIncludingEpoch - The epoch number up to which to remove caches
   */
  public async removeStaleCaches(upToAndIncludingEpoch: bigint): Promise<void> {
    if (!this.cacheDir) {
      return;
    }

    const entries: Dirent[] = await readdir(this.cacheDir, { withFileTypes: true }).catch(() => []);

    for (const item of entries) {
      if (!item.isDirectory()) {
        continue;
      }

      const [prefix, epochNumber] = item.name.split(EPOCH_DIR_SEPARATOR);
      if (prefix !== EPOCH_DIR_PREFIX) {
        continue;
      }

      const epochNumberInt = BigInt(epochNumber);
      if (epochNumberInt <= upToAndIncludingEpoch) {
        this.log.info(`Removing old epoch database for epoch ${epochNumberInt} at ${join(this.cacheDir, item.name)}`);
        await rm(join(this.cacheDir, item.name), { recursive: true });
      }
    }
  }
}
