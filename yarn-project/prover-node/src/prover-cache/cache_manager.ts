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
  constructor(
    private dataRootDir?: string,
    private cacheMapSize?: number,
    private log = createLogger('aztec:prover-node:cache-manager'),
  ) {}

  public async openCache(epochNumber: bigint, epochHash: Buffer): Promise<ProverCache> {
    if (!this.dataRootDir) {
      return new InMemoryProverCache();
    }

    const epochDataDir = join(this.dataRootDir, EPOCH_DIR_PREFIX + EPOCH_DIR_SEPARATOR + epochNumber);

    const storedEpochHash = await readFile(join(epochDataDir, EPOCH_HASH_FILENAME), 'hex').catch(() => Buffer.alloc(0));
    if (storedEpochHash.toString() !== epochHash.toString()) {
      await rm(epochDataDir, { recursive: true, force: true });
    }

    await mkdir(epochDataDir, { recursive: true });
    await writeFile(join(epochDataDir, EPOCH_HASH_FILENAME), epochHash.toString('hex'));

    const store = AztecLmdbStore.open(epochDataDir, this.cacheMapSize);
    this.log.debug(`Created new database for epoch ${epochNumber} at ${epochDataDir}`);
    const cleanup = () => store.close();
    return new KVProverCache(store, cleanup);
  }

  /**
   * Removes all caches for epochs older than the given epoch (including)
   * @param upToAndIncludingEpoch - The epoch number up to which to remove caches
   */
  public async removeStaleCaches(upToAndIncludingEpoch: bigint): Promise<void> {
    if (!this.dataRootDir) {
      return;
    }

    const entries: Dirent[] = await readdir(this.dataRootDir, { withFileTypes: true }).catch(() => []);

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
        this.log.info(
          `Removing old epoch database for epoch ${epochNumberInt} at ${join(this.dataRootDir, item.name)}`,
        );
        await rm(join(this.dataRootDir, item.name), { recursive: true });
      }
    }
  }
}
