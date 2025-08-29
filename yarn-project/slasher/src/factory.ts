import { EpochCache } from '@aztec/epoch-cache';
import type { L1ReaderConfig, ViemClient } from '@aztec/ethereum';
import {
  EmpireSlashingProposerContract,
  RollupContract,
  TallySlashingProposerContract,
} from '@aztec/ethereum/contracts';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { AztecLMDBStoreV2, createStore } from '@aztec/kv-store/lmdb-v2';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import { SlashFactoryContract } from '@aztec/stdlib/l1-contracts';

import { EmpireSlasherClient, type EmpireSlasherSettings } from './empire_slasher_client.js';
import { NullSlasherClient } from './null_slasher_client.js';
import { SlasherClientFacade } from './slasher_client_facade.js';
import type { SlasherClientInterface } from './slasher_client_interface.js';
import { SlasherOffensesStore } from './stores/offenses_store.js';
import { SlasherPayloadsStore } from './stores/payloads_store.js';
import { SCHEMA_VERSION } from './stores/schema_version.js';
import { TallySlasherClient, type TallySlasherSettings } from './tally_slasher_client.js';
import type { Watcher } from './watcher.js';

/** Creates a slasher client facade that updates itself whenever the rollup slasher changes */
export async function createSlasher(
  config: SlasherConfig & DataStoreConfig & { ethereumSlotDuration: number },
  l1Contracts: Pick<L1ReaderConfig['l1Contracts'], 'rollupAddress' | 'slashFactoryAddress'>,
  l1Client: ViemClient,
  watchers: Watcher[],
  dateProvider: DateProvider,
  epochCache: EpochCache,
  logger = createLogger('slasher'),
): Promise<SlasherClientInterface> {
  if (!l1Contracts.rollupAddress || l1Contracts.rollupAddress.equals(EthAddress.ZERO)) {
    throw new Error('Cannot initialize SlasherClient without a Rollup address');
  }

  const kvStore = await createStore('slasher', SCHEMA_VERSION, config, createLogger('slasher:lmdb'));
  const rollup = new RollupContract(l1Client, l1Contracts.rollupAddress);

  return new SlasherClientFacade(
    config,
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

/** Creates a slasher client implementation (either tally or empire) based on the slasher proposer type in the rollup */
export async function createSlasherImplementation(
  config: SlasherConfig & DataStoreConfig & { ethereumSlotDuration: number },
  rollup: RollupContract,
  l1Client: ViemClient,
  slashFactoryAddress: EthAddress | undefined,
  watchers: Watcher[],
  epochCache: EpochCache,
  dateProvider: DateProvider,
  kvStore: AztecLMDBStoreV2,
  logger = createLogger('slasher'),
) {
  const proposer = await rollup.getSlashingProposer();
  if (!proposer) {
    return new NullSlasherClient(config);
  } else if (proposer.type === 'tally') {
    return createTallySlasher(config, rollup, proposer, watchers, dateProvider, epochCache, kvStore, logger);
  } else {
    if (!slashFactoryAddress || slashFactoryAddress.equals(EthAddress.ZERO)) {
      throw new Error('Cannot initialize an empire-based SlasherClient without a SlashFactory address');
    }
    const slashFactory = new SlashFactoryContract(l1Client, slashFactoryAddress.toString());
    return createEmpireSlasher(config, rollup, proposer, slashFactory, watchers, dateProvider, kvStore, logger);
  }
}

async function createEmpireSlasher(
  config: SlasherConfig & DataStoreConfig & { ethereumSlotDuration: number },
  rollup: RollupContract,
  slashingProposer: EmpireSlashingProposerContract,
  slashFactoryContract: SlashFactoryContract,
  watchers: Watcher[],
  dateProvider: DateProvider,
  kvStore: AztecLMDBStoreV2,
  logger = createLogger('slasher'),
): Promise<EmpireSlasherClient> {
  if (slashingProposer.type !== 'empire') {
    throw new Error('Slashing proposer contract is not of type Empire');
  }

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
  ]);

  const settings: EmpireSlasherSettings = {
    slashingExecutionDelayInRounds: Number(slashingExecutionDelayInRounds),
    slashingPayloadLifetimeInRounds: Number(slashingPayloadLifetimeInRounds),
    slashingRoundSize: Number(slashingRoundSize),
    slashingQuorumSize: Number(slashingQuorumSize),
    epochDuration: Number(epochDuration),
    proofSubmissionEpochs: Number(proofSubmissionEpochs),
    l1GenesisTime: l1GenesisTime,
    slotDuration: Number(slotDuration),
    l1StartBlock,
    ethereumSlotDuration: config.ethereumSlotDuration,
  };

  const payloadsStore = new SlasherPayloadsStore(kvStore);
  const offensesStore = new SlasherOffensesStore(kvStore, settings);

  return new EmpireSlasherClient(
    config,
    settings,
    slashFactoryContract,
    slashingProposer,
    EthAddress.fromString(rollup.address),
    watchers,
    dateProvider,
    offensesStore,
    payloadsStore,
    logger,
  );
}

async function createTallySlasher(
  config: SlasherConfig & DataStoreConfig,
  rollup: RollupContract,
  slashingProposer: TallySlashingProposerContract,
  watchers: Watcher[],
  dateProvider: DateProvider,
  epochCache: EpochCache,
  kvStore: AztecLMDBStoreV2,
  logger = createLogger('slasher'),
): Promise<TallySlasherClient> {
  if (slashingProposer.type !== 'tally') {
    throw new Error('Slashing proposer contract is not of type tally');
  }

  const [
    slashingExecutionDelayInRounds,
    slashingRoundSize,
    slashingRoundSizeInEpochs,
    slashingLifetimeInRounds,
    slashingOffsetInRounds,
    slashingAmounts,
    slashingQuorumSize,
    epochDuration,
    l1GenesisTime,
    slotDuration,
    targetCommitteeSize,
  ] = await Promise.all([
    slashingProposer.getExecutionDelayInRounds(),
    slashingProposer.getRoundSize(),
    slashingProposer.getRoundSizeInEpochs(),
    slashingProposer.getLifetimeInRounds(),
    slashingProposer.getSlashOffsetInRounds(),
    slashingProposer.getSlashingAmounts(),
    slashingProposer.getQuorumSize(),
    rollup.getEpochDuration(),
    rollup.getL1GenesisTime(),
    rollup.getSlotDuration(),
    rollup.getTargetCommitteeSize(),
  ]);

  const settings: TallySlasherSettings = {
    slashingExecutionDelayInRounds: Number(slashingExecutionDelayInRounds),
    slashingRoundSize: Number(slashingRoundSize),
    slashingRoundSizeInEpochs: Number(slashingRoundSizeInEpochs),
    slashingLifetimeInRounds: Number(slashingLifetimeInRounds),
    slashingQuorumSize: Number(slashingQuorumSize),
    epochDuration: Number(epochDuration),
    l1GenesisTime: l1GenesisTime,
    slotDuration: Number(slotDuration),
    slashingOffsetInRounds: Number(slashingOffsetInRounds),
    slashingAmounts,
    targetCommitteeSize: Number(targetCommitteeSize),
  };

  const offensesStore = new SlasherOffensesStore(kvStore, settings);

  return new TallySlasherClient(
    config,
    settings,
    slashingProposer,
    rollup,
    watchers,
    epochCache,
    dateProvider,
    offensesStore,
    logger,
  );
}
