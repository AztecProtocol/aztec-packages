import { EthAddress } from '@aztec/circuits.js';
import { Logger, createLogger } from '@aztec/foundation/log';

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { DataStoreConfig } from '../config.js';
import { AztecLMDBStoreV2 } from './store.js';

const ROLLUP_ADDRESS_FILE = 'rollup_address';
const MAX_READERS = 16;

export async function createStore(
  name: string,
  config: DataStoreConfig,
  log: Logger = createLogger('kv-store:lmdb-v2:' + name),
): Promise<AztecLMDBStoreV2> {
  let { dataDirectory, l1Contracts } = config;

  let store: AztecLMDBStoreV2;
  if (typeof dataDirectory !== 'undefined') {
    dataDirectory = join(dataDirectory, name);
    await mkdir(dataDirectory);

    if (l1Contracts) {
      const { rollupAddress } = l1Contracts;
      const localRollupAddress = await readFile(join(dataDirectory, ROLLUP_ADDRESS_FILE), 'utf-8')
        .then(EthAddress.fromString)
        .catch(() => EthAddress.ZERO);

      if (!localRollupAddress.equals(rollupAddress)) {
        if (!localRollupAddress.isZero()) {
          log.warn(`Rollup address mismatch. Clearing entire database...`, {
            expected: rollupAddress,
            found: localRollupAddress,
          });

          await rm(dataDirectory, { recursive: true, force: true });
          await mkdir(dataDirectory);
        }

        await writeFile(join(dataDirectory, ROLLUP_ADDRESS_FILE), rollupAddress.toString());
      }
    }

    log.info(
      `Creating ${name} data store at directory ${dataDirectory} with map size ${config.dataStoreMapSizeKB} KB (LMDB v2)`,
    );
    store = await AztecLMDBStoreV2.new(dataDirectory, config.dataStoreMapSizeKB);
  } else {
    store = await openTmpStore(name, true, config.dataStoreMapSizeKB, log);
  }

  return store;
}

export async function openTmpStore(
  name: string,
  ephemeral: boolean = false,
  dbMapSizeKb = 10 * 1_024 * 1_024, // 10GB
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

  return AztecLMDBStoreV2.new(dataDir, dbMapSizeKb, MAX_READERS, cleanup, log);
}
