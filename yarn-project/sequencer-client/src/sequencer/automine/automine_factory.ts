import type { Archiver } from '@aztec/archiver';
import type { BlobClientInterface } from '@aztec/blob-client/client';
import type { EpochCache } from '@aztec/epoch-cache';
import { GovernanceProposerContract, type RollupContract } from '@aztec/ethereum/contracts';
import type { L1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import { PublisherManager } from '@aztec/ethereum/publisher-manager';
import { EthCheatCodes } from '@aztec/ethereum/test';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import type { Logger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';
import type { KeystoreManager } from '@aztec/node-keystore';
import type { P2PClient as ConcreteP2PClient, P2P } from '@aztec/p2p';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { ChainConfig } from '@aztec/stdlib/config';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { TelemetryClient } from '@aztec/telemetry-client';
import { type FullNodeCheckpointsBuilder, NodeKeystoreAdapter, type ValidatorClient } from '@aztec/validator-client';

import { type SequencerClientConfig, getPublisherConfigFromSequencerConfig } from '../../config.js';
import type { GlobalVariableBuilder } from '../../global_variable_builder/global_builder.js';
import { SequencerPublisherFactory } from '../../publisher/sequencer-publisher-factory.js';
import { AutomineSequencer } from './automine_sequencer.js';

/** Arguments for {@link createAutomineSequencer}. */
export type CreateAutomineSequencerArgs = {
  config: SequencerClientConfig & Pick<ChainConfig, 'l1ChainId' | 'rollupAddress'>;
  l1TxUtils: L1TxUtils[];
  funderL1TxUtils: L1TxUtils | undefined;
  publicClient: ViemPublicClient;
  rollupContract: RollupContract;
  epochCache: EpochCache;
  blobClient: BlobClientInterface | undefined;
  telemetry: TelemetryClient;
  dateProvider: DateProvider;
  keyStoreManager: KeystoreManager;
  validatorClient: ValidatorClient;
  checkpointsBuilder: FullNodeCheckpointsBuilder;
  globalVariableBuilder: GlobalVariableBuilder;
  worldStateSynchronizer: WorldStateSynchronizer;
  archiver: L2BlockSource &
    L1ToL2MessageSource &
    Pick<
      Archiver,
      'rollbackTo' | 'addBlock' | 'addProposedCheckpoint' | 'syncImmediate' | 'removeUncheckpointedBlocksAfter'
    >;
  p2pClient: P2P & Pick<ConcreteP2PClient, 'sync'>;
  l1Constants: { l1GenesisTime: bigint; slotDuration: number; ethereumSlotDuration: number; rollupManaLimit: number };
  /** When true, run the auto-settle / clock-reconcile loop (local-network only). */
  autoSettle?: boolean;
  log: Logger;
};

/**
 * Builds an {@link AutomineSequencer} for use in single-sequencer e2e tests.
 *
 * Constructs the PublisherManager, GovernanceProposerContract, SequencerPublisherFactory,
 * looks up the attestor/coinbase/feeRecipient from the keystore, wires EthCheatCodes,
 * and starts the publisher manager before returning.
 */
export async function createAutomineSequencer({
  config,
  l1TxUtils,
  funderL1TxUtils,
  publicClient,
  rollupContract,
  epochCache,
  blobClient,
  telemetry,
  dateProvider,
  keyStoreManager,
  validatorClient,
  checkpointsBuilder,
  globalVariableBuilder,
  worldStateSynchronizer,
  archiver,
  p2pClient,
  l1Constants,
  autoSettle,
  log,
}: CreateAutomineSequencerArgs): Promise<AutomineSequencer> {
  const publisherManager = new PublisherManager(l1TxUtils, getPublisherConfigFromSequencerConfig(config), {
    bindings: log.getBindings(),
    funder: funderL1TxUtils,
  });
  const governanceProposerContract = new GovernanceProposerContract(
    publicClient,
    config.governanceProposerAddress.toString(),
  );
  const publisherFactory = new SequencerPublisherFactory(config, {
    telemetry,
    blobClient: blobClient!,
    epochCache,
    governanceProposerContract,
    rollupContract,
    dateProvider,
    publisherManager,
    nodeKeyStore: NodeKeystoreAdapter.fromKeyStoreManager(keyStoreManager),
    logger: log,
  });
  const attestorAddresses = NodeKeystoreAdapter.fromKeyStoreManager(keyStoreManager).getAttesterAddresses();
  const attestor = attestorAddresses[0];
  if (!attestor) {
    throw new Error('AutomineSequencer requires at least one attestor address in the keystore');
  }
  const coinbase = validatorClient.getCoinbaseForAttestor(attestor);
  const feeRecipient = validatorClient.getFeeRecipientForAttestor(attestor);
  const ethCheatCodes = new EthCheatCodes(config.l1RpcUrls, dateProvider, log.createChild('eth-cheat-codes'));

  // Include the funder's L1TxUtils in the reorg reset list so funding-tx nonces don't
  // go stale after L1 rollbacks. Dedupe by sender address in case the funder reuses a
  // publisher's signer.
  const reorgResetL1TxUtils = (() => {
    if (!funderL1TxUtils) {
      return l1TxUtils;
    }
    const funderAddress = funderL1TxUtils.getSenderAddress().toString();
    const alreadyIncluded = l1TxUtils.some(utils => utils.getSenderAddress().toString() === funderAddress);
    return alreadyIncluded ? l1TxUtils : [...l1TxUtils, funderL1TxUtils];
  })();

  const automineSequencer = new AutomineSequencer({
    publisherFactory,
    checkpointsBuilder,
    globalsBuilder: globalVariableBuilder,
    worldState: worldStateSynchronizer,
    l2BlockSource: archiver,
    l1ToL2MessageSource: archiver,
    p2pClient,
    ethCheatCodes,
    dateProvider: dateProvider as any, // TestDateProvider; verified at construction in fixture
    l1Constants: {
      l1GenesisTime: l1Constants.l1GenesisTime,
      slotDuration: l1Constants.slotDuration,
      ethereumSlotDuration: l1Constants.ethereumSlotDuration,
      rollupManaLimit: l1Constants.rollupManaLimit,
      epochDuration: config.aztecEpochDuration,
    },
    coinbase,
    feeRecipient,
    signatureContext: { chainId: config.l1ChainId, rollupAddress: config.rollupAddress },
    config,
    archiver,
    l1TxUtils: reorgResetL1TxUtils,
    autoSettle,
    stopExtras: () => publisherManager.stop(),
    log: log.createChild('automine-sequencer'),
  });

  await publisherManager.start();
  return automineSequencer;
}
