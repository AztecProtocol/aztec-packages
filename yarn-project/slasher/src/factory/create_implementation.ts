import { EpochCache } from '@aztec/epoch-cache';
import type { ViemClient } from '@aztec/ethereum';
import {
  EmpireSlashingProposerContract,
  RollupContract,
  TallySlashingProposerContract,
} from '@aztec/ethereum/contracts';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { AztecLMDBStoreV2 } from '@aztec/kv-store/lmdb-v2';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import { SlashFactoryContract } from '@aztec/stdlib/l1-contracts';

import { EmpireSlasherClient, type EmpireSlasherSettings } from '../empire_slasher_client.js';
import { NullSlasherClient } from '../null_slasher_client.js';
import { SlasherOffensesStore } from '../stores/offenses_store.js';
import { SlasherPayloadsStore } from '../stores/payloads_store.js';
import { TallySlasherClient } from '../tally_slasher_client.js';
import type { Watcher } from '../watcher.js';
import { getTallySlasherSettings } from './get_settings.js';

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
    slasher,
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
    rollup.getSlasherContract(),
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
    slashingAmounts: undefined,
  };

  const payloadsStore = new SlasherPayloadsStore(kvStore, {
    slashingPayloadLifetimeInRounds: settings.slashingPayloadLifetimeInRounds,
  });
  const offensesStore = new SlasherOffensesStore(kvStore, {
    ...settings,
    slashOffenseExpirationRounds: config.slashOffenseExpirationRounds,
  });

  return new EmpireSlasherClient(
    config,
    settings,
    slashFactoryContract,
    slashingProposer,
    slasher!,
    rollup,
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

  const settings = await getTallySlasherSettings(rollup, slashingProposer);
  const slasher = await rollup.getSlasherContract();

  const offensesStore = new SlasherOffensesStore(kvStore, {
    ...settings,
    slashOffenseExpirationRounds: config.slashOffenseExpirationRounds,
  });

  return new TallySlasherClient(
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
