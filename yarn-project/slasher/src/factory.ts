import { type L1ReaderConfig, RollupContract, type ViemClient } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import { SlashFactoryContract } from '@aztec/stdlib/l1-contracts';

import type { Watcher } from './config.js';
import { SlasherClient, type SlasherSettings } from './slasher_client.js';
import { SlasherOffensesStore } from './stores/offenses_store.js';
import { SlasherPayloadsStore } from './stores/payloads_store.js';
import { SCHEMA_VERSION } from './stores/schema_version.js';

export async function createSlasher(
  config: SlasherConfig & DataStoreConfig & { slasherEnabled?: boolean },
  l1Contracts: Pick<L1ReaderConfig['l1Contracts'], 'rollupAddress' | 'slashFactoryAddress'>,
  l1Client: ViemClient,
  watchers: Watcher[],
  dateProvider: DateProvider,
  settings?: SlasherSettings,
  logger = createLogger('slasher'),
): Promise<SlasherClient | undefined> {
  if (!config.slasherEnabled) {
    return undefined;
  }

  if (!config.dataDirectory) {
    throw new Error('Slasher requires a data directory to store offenses and payloads');
  }

  if (!l1Contracts.rollupAddress || l1Contracts.rollupAddress.equals(EthAddress.ZERO)) {
    throw new Error('Cannot initialize SlasherClient without a Rollup address');
  }

  if (!l1Contracts.slashFactoryAddress || l1Contracts.slashFactoryAddress.equals(EthAddress.ZERO)) {
    throw new Error('Cannot initialize SlasherClient without a SlashFactory address');
  }

  const rollup = new RollupContract(l1Client, l1Contracts.rollupAddress);
  const slashingProposer = await rollup.getSlashingProposer();
  const slashFactoryContract = new SlashFactoryContract(l1Client, l1Contracts.slashFactoryAddress.toString());

  if (settings === undefined) {
    const [
      slashingExecutionDelayInRounds,
      slashingPayloadLifetimeInRounds,
      slashingRoundSize,
      slashingQuorumSize,
      epochDuration,
      proofSubmissionEpochs,
      l1GenesisTime,
      slotDuration,
      l1StartBlock,
      ethereumSlotDuration,
    ] = await Promise.all([
      slashingProposer.getExecutionDelayInRounds(),
      slashingProposer.getLifetimeInRounds(),
      slashingProposer.getRoundSize(),
      slashingProposer.getQuorumSize(),
      rollup.getEpochDuration(),
      rollup.getProofSubmissionEpochs(),
      rollup.getL1GenesisTime(),
      rollup.getSlotDuration(),
      rollup.getL1StartBlock(),
      rollup.getSlotDuration(),
    ]);

    settings = {
      slashingExecutionDelayInRounds,
      slashingPayloadLifetimeInRounds,
      slashingRoundSize,
      slashingQuorumSize,
      epochDuration: Number(epochDuration),
      proofSubmissionEpochs: Number(proofSubmissionEpochs),
      l1GenesisTime: l1GenesisTime,
      slotDuration: Number(slotDuration),
      l1StartBlock,
      ethereumSlotDuration: Number(ethereumSlotDuration),
    };
  }

  const kvStore = await createStore('slasher', SCHEMA_VERSION, config, createLogger('slasher:lmdb'));
  const payloadsStore = new SlasherPayloadsStore(kvStore);
  const offensesStore = new SlasherOffensesStore(kvStore, settings);

  return new SlasherClient(
    config,
    settings,
    slashFactoryContract,
    slashingProposer,
    l1Contracts.rollupAddress,
    watchers,
    dateProvider,
    offensesStore,
    payloadsStore,
    logger,
  );
}
