import { EpochCache } from '@aztec/epoch-cache';
import { RollupContract, SlashingProposerContract } from '@aztec/ethereum/contracts';
import type { ViemClient } from '@aztec/ethereum/types';
import type { SlotNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { AztecLMDBStoreV2 } from '@aztec/kv-store/lmdb-v2';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import type { DataStoreConfig } from '@aztec/stdlib/kv-store';

import { NullSlasherClient } from '../null_slasher_client.js';
import { SlasherClient } from '../slasher_client.js';
import { SlasherOffensesStore } from '../stores/offenses_store.js';
import type { Watcher } from '../watcher.js';
import { getSlasherSettings } from './get_settings.js';

/** Creates a slasher client implementation based on the slasher proposer type in the rollup */
export async function createSlasherImplementation(
  config: SlasherConfig & DataStoreConfig & { ethereumSlotDuration: number },
  rollup: RollupContract,
  l1Client: ViemClient,
  watchers: Watcher[],
  epochCache: EpochCache,
  dateProvider: DateProvider,
  kvStore: AztecLMDBStoreV2,
  rollupRegisteredAtL2Slot: SlotNumber,
  logger = createLogger('slasher'),
) {
  const proposer = await rollup.getSlashingProposer();
  if (!proposer) {
    return new NullSlasherClient(config);
  } else {
    return createSlasher(
      config,
      rollup,
      proposer,
      watchers,
      dateProvider,
      epochCache,
      kvStore,
      rollupRegisteredAtL2Slot,
      logger,
    );
  }
}

async function createSlasher(
  config: SlasherConfig & DataStoreConfig,
  rollup: RollupContract,
  slashingProposer: SlashingProposerContract,
  watchers: Watcher[],
  dateProvider: DateProvider,
  epochCache: EpochCache,
  kvStore: AztecLMDBStoreV2,
  rollupRegisteredAtL2Slot: SlotNumber,
  logger = createLogger('slasher'),
): Promise<SlasherClient> {
  const settings = { ...(await getSlasherSettings(rollup, slashingProposer)), rollupRegisteredAtL2Slot };
  const slasher = await rollup.getSlasherContract();

  const offensesStore = new SlasherOffensesStore(kvStore, {
    ...settings,
    slashOffenseExpirationRounds: config.slashOffenseExpirationRounds,
  });

  return new SlasherClient(
    config,
    settings,
    slashingProposer,
    slasher!,
    rollup,
    watchers,
    epochCache,
    dateProvider,
    offensesStore,
    logger,
  );
}
