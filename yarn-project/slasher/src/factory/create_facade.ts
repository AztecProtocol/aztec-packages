import { EpochCache } from '@aztec/epoch-cache';
import type { L1ReaderConfig, ViemClient } from '@aztec/ethereum';
import { RollupContract } from '@aztec/ethereum/contracts';
import { unique } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';

import { SlasherClientFacade } from '../slasher_client_facade.js';
import type { SlasherClientInterface } from '../slasher_client_interface.js';
import { SCHEMA_VERSION } from '../stores/schema_version.js';
import type { Watcher } from '../watcher.js';

/** Creates a slasher client facade that updates itself whenever the rollup slasher changes */
export async function createSlasherFacade(
  config: SlasherConfig & DataStoreConfig & { ethereumSlotDuration: number },
  l1Contracts: Pick<L1ReaderConfig['l1Contracts'], 'rollupAddress' | 'slashFactoryAddress'>,
  l1Client: ViemClient,
  watchers: Watcher[],
  dateProvider: DateProvider,
  epochCache: EpochCache,
  /** List of own validator addresses to add to the slashValidatorNever list unless slashSelfAllowed is true */
  validatorAddresses: EthAddress[] = [],
  logger = createLogger('slasher'),
): Promise<SlasherClientInterface> {
  if (!l1Contracts.rollupAddress || l1Contracts.rollupAddress.equals(EthAddress.ZERO)) {
    throw new Error('Cannot initialize SlasherClient without a Rollup address');
  }

  const kvStore = await createStore('slasher', SCHEMA_VERSION, config, createLogger('slasher:lmdb'));
  const rollup = new RollupContract(l1Client, l1Contracts.rollupAddress);

  const slashValidatorsNever = config.slashSelfAllowed
    ? config.slashValidatorsNever
    : unique([...config.slashValidatorsNever, ...validatorAddresses].map(a => a.toString())).map(EthAddress.fromString);
  const updatedConfig = { ...config, slashValidatorsNever };

  return new SlasherClientFacade(
    updatedConfig,
    rollup,
    l1Client,
    l1Contracts.slashFactoryAddress,
    watchers,
    epochCache,
    dateProvider,
    kvStore,
    logger,
  );
}
