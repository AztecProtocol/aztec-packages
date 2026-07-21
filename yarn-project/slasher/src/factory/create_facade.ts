import { EpochCache } from '@aztec/epoch-cache';
import { RegistryContract, RollupContract } from '@aztec/ethereum/contracts';
import type { L1ReaderConfig } from '@aztec/ethereum/l1-reader';
import type { ViemClient } from '@aztec/ethereum/types';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { unique } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import { getSlotAtTimestamp } from '@aztec/stdlib/epoch-helpers';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import type { DataStoreConfig } from '@aztec/stdlib/kv-store';

import { SlasherClientFacade } from '../slasher_client_facade.js';
import type { SlasherClientInterface } from '../slasher_client_interface.js';
import { SCHEMA_VERSION } from '../stores/schema_version.js';
import type { Watcher } from '../watcher.js';

/** Creates a slasher client facade that updates itself whenever the rollup slasher changes */
export async function createSlasherFacade(
  config: SlasherConfig & DataStoreConfig & { ethereumSlotDuration: number },
  l1Contracts: Pick<L1ReaderConfig, 'rollupAddress' | 'registryAddress'>,
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

  const kvStore = await createStore('slasher', SCHEMA_VERSION, config, logger.getBindings());
  const rollup = new RollupContract(l1Client, l1Contracts.rollupAddress);

  // Compute and cache the L2 slot at which the rollup was registered as canonical
  const settingsMap = kvStore.openMap<string, number>('slasher-settings');
  const cacheKey = `registeredSlot:${l1Contracts.rollupAddress}`;
  let rollupRegisteredAtL2Slot = (await settingsMap.getAsync(cacheKey)) as SlotNumber | undefined;

  if (rollupRegisteredAtL2Slot === undefined) {
    const registry = new RegistryContract(l1Client, l1Contracts.registryAddress);
    const l1StartBlock = await rollup.getL1StartBlock();
    const registrationTimestamp = await registry.getCanonicalRollupRegistrationTimestamp(
      l1Contracts.rollupAddress,
      l1StartBlock,
    );
    if (registrationTimestamp !== undefined) {
      const l1GenesisTime = await rollup.getL1GenesisTime();
      const slotDuration = await rollup.getSlotDuration();
      rollupRegisteredAtL2Slot = getSlotAtTimestamp(registrationTimestamp, {
        l1GenesisTime,
        slotDuration: Number(slotDuration),
      });
    } else {
      rollupRegisteredAtL2Slot = SlotNumber(0);
    }
    await settingsMap.set(cacheKey, rollupRegisteredAtL2Slot);
    logger.info(`Canonical rollup registered at L2 slot ${rollupRegisteredAtL2Slot}`);
  }

  const slashValidatorsNever = config.slashSelfAllowed
    ? config.slashValidatorsNever
    : unique([...config.slashValidatorsNever, ...validatorAddresses].map(a => a.toString())).map(EthAddress.fromString);
  const updatedConfig = { ...config, slashValidatorsNever };

  return new SlasherClientFacade(
    updatedConfig,
    rollup,
    l1Client,
    watchers,
    epochCache,
    dateProvider,
    kvStore,
    rollupRegisteredAtL2Slot,
    logger,
  );
}
