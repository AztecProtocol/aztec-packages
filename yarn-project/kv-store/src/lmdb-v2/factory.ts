import { EthAddress } from '@aztec/circuits.js';
import { type Logger, createLogger } from '@aztec/foundation/log';

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { type DataStoreConfig } from '../config.js';
import { AztecLMDBStoreV2 } from './store.js';

const ROLLUP_ADDRESS_FILE = 'rollup_address';
const MAX_READERS = 16;

export async function createStore(
  name: string,
  config: DataStoreConfig,
  log: Logger = createLogger('kv-store:lmdb-v2:' + name),
): Promise<AztecLMDBStoreV2> {
  const { dataDirectory, l1Contracts } = config;

  let store: AztecLMDBStoreV2;
  if (typeof dataDirectory !== 'undefined') {
    const subDir = join(dataDirectory, name);
    await mkdir(subDir, { recursive: true });

    if (l1Contracts) {
      const { rollupAddress } = l1Contracts;
      const localRollupAddress = await readFile(join(subDir, ROLLUP_ADDRESS_FILE), 'utf-8')
        .then(EthAddress.fromString)
        .catch(() => EthAddress.ZERO);

      if (!localRollupAddress.equals(rollupAddress)) {
        if (!localRollupAddress.isZero()) {
          log.warn(`Rollup address mismatch. Clearing entire database...`, {
            expected: rollupAddress,
            found: localRollupAddress,
          });

          await rm(subDir, { recursive: true, force: true });
          await mkdir(subDir, { recursive: true });
        }

        await writeFile(join(subDir, ROLLUP_ADDRESS_FILE), rollupAddress.toString());
      }
    }

    log.info(
      `Creating ${name} data store at directory ${subDir} with map size ${config.dataStoreMapSizeKB} KB (LMDB v2)`,
    );
    store = await AztecLMDBStoreV2.new(subDir, config.dataStoreMapSizeKB, MAX_READERS, () => Promise.resolve(), log);
  } else {
    store = await openTmpStore(name, true, config.dataStoreMapSizeKB, MAX_READERS, log);
  }

  return store;
}

export async function openTmpStore(
  name: string,
  ephemeral: boolean = true,
  dbMapSizeKb = 10 * 1_024 * 1_024, // 10GB
  maxReaders = MAX_READERS,
  log: Logger = createLogger('kv-store:lmdb-v2:' + name),
): Promise<AztecLMDBStoreV2> {
  const dataDir = await mkdtemp(join(tmpdir(), name + '-'));
  log.debug(`Created temporary data store at: ${dataDir} with size: ${dbMapSizeKb} KB (LMDB v2)`);

  // pass a cleanup callback because process.on('beforeExit', cleanup) does not work under Jest
  const cleanup = async () => {
    if (ephemeral) {
      await rm(dataDir, { recursive: true, force: true });
      log.debug(`Deleted temporary data store: ${dataDir}`);
    } else {
      log.debug(`Leaving temporary data store: ${dataDir}`);
    }
  };

  return AztecLMDBStoreV2.new(dataDir, dbMapSizeKb, maxReaders, cleanup, log);
}

export function openStoreAt(
  dataDir: string,
  dbMapSizeKb = 10 * 1_024 * 1_024, // 10GB
  maxReaders = MAX_READERS,
  log: Logger = createLogger('kv-store:lmdb-v2'),
): Promise<AztecLMDBStoreV2> {
  log.debug(`Opening data store at: ${dataDir} with size: ${dbMapSizeKb} KB (LMDB v2)`);
  return AztecLMDBStoreV2.new(dataDir, dbMapSizeKb, maxReaders, undefined, log);
}
