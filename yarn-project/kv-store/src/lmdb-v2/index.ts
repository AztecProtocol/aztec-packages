import { EthAddress } from '@aztec/circuits.js';
import { Logger, createLogger } from '@aztec/foundation/log';

import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';

import { DataStoreConfig } from '../config.js';
import { AztecLMDBStoreV2 } from './store.js';

export * from './store.js';

const ROLLUP_ADDRESS_FILE = 'rollup_address';

export async function createStore(
  name: string,
  config: DataStoreConfig,
  log: Logger = createLogger('kv-store:lmdb-v2'),
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
    log.info(`Creating ${name} ephemeral data store with map size ${config.dataStoreMapSizeKB} KB (LMDB v2)`);
    store = await AztecLMDBStoreV2.tmp(name, true, config.dataStoreMapSizeKB);
  }

  return store;
}

export function openTmpStore(name: string, ephemeral: boolean = false): Promise<AztecLMDBStoreV2> {
  const mapSize = 1024 * 1024 * 10; // 10 GB map size
  return AztecLMDBStoreV2.tmp(name, ephemeral, mapSize);
}
