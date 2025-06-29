import { type AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import {
  Fr,
  type Logger,
  MerkleTreeId,
  type Wallet,
  getContractInstanceFromDeployParams,
  getTimestampRangeForEpoch,
  retryUntil,
  sleep,
} from '@aztec/aztec.js';
import { type ExtendedViemWalletClient, createExtendedL1Client } from '@aztec/ethereum';
import { RollupContract } from '@aztec/ethereum/contracts';
import { ChainMonitor, DelayedTxUtils, type Delayer, waitUntilL1Timestamp, withDelayer } from '@aztec/ethereum/test';
import { SecretValue } from '@aztec/foundation/config';
import { randomBytes } from '@aztec/foundation/crypto';
import { withLogNameSuffix } from '@aztec/foundation/log';
import { SpamContract } from '@aztec/noir-test-contracts.js/Spam';
import { getMockPubSubP2PServiceFactory } from '@aztec/p2p/test-helpers';
import { ProverNode, ProverNodePublisher } from '@aztec/prover-node';
import type { TestProverNode } from '@aztec/prover-node/test';
import type { SequencerPublisher } from '@aztec/sequencer-client';
import type { TestSequencerClient } from '@aztec/sequencer-client/test';
import type { L2BlockNumber } from '@aztec/stdlib/block';
import { type L1RollupConstants, getProofSubmissionDeadlineTimestamp } from '@aztec/stdlib/epoch-helpers';
import { tryStop } from '@aztec/stdlib/interfaces/server';

import { join } from 'path';
import type { Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import {
  type EndToEndContext,
  type SetupOptions,
  createAndSyncProverNode,
  getPrivateKeyFromIndex,
  setup,
} from '../fixtures/utils.js';

export const WORLD_STATE_BLOCK_HISTORY = 2;
export const WORLD_STATE_BLOCK_CHECK_INTERVAL = 50;
export const ARCHIVER_POLL_INTERVAL = 50;

export type EpochsTestOpts = Partial<
  Pick<
    SetupOptions,
    | 'startProverNode'
    | 'aztecProofSubmissionEpochs'
    | 'aztecEpochDuration'
    | 'proverTestDelayMs'
    | 'l1PublishRetryIntervalMS'
    | 'txPropagationMaxQueryAttempts'
    | 'proverNodeConfig'
    | 'ethereumSlotDuration'
    | 'aztecSlotDuration'
    | 'initialValidators'
    | 'mockGossipSubNetwork'
    | 'disableAnvilTestWatcher'
  >
> & { numberOfAccounts?: number };

/**
 * Tests building of epochs using fast block times and short epochs.
 * Spawns an aztec node and a prover node with fake proofs.
 * Sequencer is allowed to build empty blocks.
 */
export class EpochsTestContext {
  public context!: EndToEndContext;
  public l1Client!: ExtendedViemWalletClient;
  public rollup!: RollupContract;
  public constants!: L1RollupConstants;
  public logger!: Logger;
  public monitor!: ChainMonitor;
  public proverDelayer!: Delayer;
  public sequencerDelayer!: Delayer;

  public proverNodes: ProverNode[] = [];
  public nodes: AztecNodeService[] = [];

  public epochDuration!: number;

  public L1_BLOCK_TIME_IN_S!: number;
  public L2_SLOT_DURATION_IN_S!: number;

  public static async setup(opts: EpochsTestOpts = {}) {
    const test = new EpochsTestContext();
    await test.setup(opts);
    return test;
  }

  public static getSlotDurations(opts: EpochsTestOpts = {}) {
    const envEthereumSlotDuration = process.env.L1_BLOCK_TIME ? parseInt(process.env.L1_BLOCK_TIME) : 8;
    const ethereumSlotDuration = opts.ethereumSlotDuration ?? envEthereumSlotDuration;
    const aztecSlotDuration = opts.aztecSlotDuration ?? ethereumSlotDuration * 2;
    const aztecEpochDuration = opts.aztecEpochDuration ?? 4;
    const aztecProofSubmissionEpochs = opts.aztecProofSubmissionEpochs ?? 1;
    return { ethereumSlotDuration, aztecSlotDuration, aztecEpochDuration, aztecProofSubmissionEpochs };
  }

  public async setup(opts: EpochsTestOpts = {}) {
    const { ethereumSlotDuration, aztecSlotDuration, aztecEpochDuration, aztecProofSubmissionEpochs } =
      EpochsTestContext.getSlotDurations(opts);

    this.L1_BLOCK_TIME_IN_S = ethereumSlotDuration;
    this.L2_SLOT_DURATION_IN_S = aztecSlotDuration;

    // Set up system without any account nor protocol contracts
    // and with faster block times and shorter epochs.
    const context = await setup(opts.numberOfAccounts ?? 0, {
      automineL1Setup: true,
      checkIntervalMs: 50,
      archiverPollingIntervalMS: ARCHIVER_POLL_INTERVAL,
      worldStateBlockCheckIntervalMS: WORLD_STATE_BLOCK_CHECK_INTERVAL,
      skipProtocolContracts: true,
      salt: 1,
      aztecEpochDuration,
      aztecSlotDuration,
      ethereumSlotDuration,
      aztecProofSubmissionEpochs,
      aztecTargetCommitteeSize: opts.initialValidators?.length ?? 0,
      minTxsPerBlock: 0,
      realProofs: false,
      startProverNode: true,
      proverTestDelayMs: opts.proverTestDelayMs ?? 0,
      // We use numeric incremental prover ids for simplicity, but we can switch to
      // using the prover's eth address if the proverId is used for something in the rollup contract
      proverId: Fr.fromString('1'),
      // This must be enough so that the tx from the prover is delayed properly,
      // but not so much to hang the sequencer and timeout the teardown
      txPropagationMaxQueryAttempts: opts.txPropagationMaxQueryAttempts ?? 12,
      worldStateBlockHistory: WORLD_STATE_BLOCK_HISTORY,
      ...opts,
    });

    this.context = context;
    this.proverNodes = context.proverNode ? [context.proverNode] : [];
    this.nodes = context.aztecNode ? [context.aztecNode as AztecNodeService] : [];
    this.logger = context.logger;
    this.l1Client = context.deployL1ContractsValues.l1Client;
    this.rollup = RollupContract.getFromConfig(context.config);

    // Loop that tracks L1 and L2 block numbers and logs whenever there's a new one.
    this.monitor = new ChainMonitor(this.rollup, context.dateProvider, this.logger).start();

    // This is hideous.
    // We ought to have a definite reference to the l1TxUtils that we're using in both places, provided by the test context.
    this.proverDelayer = context.proverNode
      ? (((context.proverNode as TestProverNode).publisher as ProverNodePublisher).l1TxUtils as DelayedTxUtils).delayer!
      : undefined!;
    this.sequencerDelayer = context.sequencer
      ? (
          ((context.sequencer as TestSequencerClient).sequencer.publisher as SequencerPublisher)
            .l1TxUtils as DelayedTxUtils
        ).delayer!
      : undefined!;

    if ((context.proverNode && !this.proverDelayer) || (context.sequencer && !this.sequencerDelayer)) {
      throw new Error(`Could not find prover or sequencer delayer`);
    }

    // Constants used for time calculation
    this.epochDuration = aztecEpochDuration;
    this.constants = {
      epochDuration: aztecEpochDuration,
      slotDuration: aztecSlotDuration,
      l1StartBlock: await this.rollup.getL1StartBlock(),
      l1GenesisTime: await this.rollup.getL1GenesisTime(),
      ethereumSlotDuration,
      proofSubmissionEpochs: Number(await this.rollup.getProofSubmissionEpochs()),
    };

    this.logger.info(
      `L2 genesis at L1 block ${this.constants.l1StartBlock} (timestamp ${this.constants.l1GenesisTime})`,
    );
  }

  public async teardown() {
    await this.monitor.stop();
    await Promise.all(this.proverNodes.map(node => tryStop(node, this.logger)));
    await Promise.all(this.nodes.map(node => tryStop(node, this.logger)));
    await this.context.teardown();
  }

  public async createProverNode() {
    this.logger.warn('Creating and syncing a simulated prover node...');
    const proverNodePrivateKey = this.getNextPrivateKey();
    const suffix = (this.proverNodes.length + 1).toString();
    const proverNode = await withLogNameSuffix(suffix, () =>
      createAndSyncProverNode(
        proverNodePrivateKey,
        { ...this.context.config, proverId: Fr.fromString(suffix) },
        { dataDirectory: join(this.context.config.dataDirectory!, randomBytes(8).toString('hex')) },
        this.context.aztecNode,
      ),
    );
    this.proverNodes.push(proverNode);
    return proverNode;
  }

  public createNonValidatorNode(opts: Partial<AztecNodeConfig> = {}) {
    this.logger.warn('Creating and syncing a node without a validator...');
    return this.createNode({ ...opts, disableValidator: true });
  }

  public createValidatorNode(
    privateKeys: `0x${string}`[],
    opts: Partial<AztecNodeConfig> & { dontStartSequencer?: boolean } = {},
  ) {
    this.logger.warn('Creating and syncing a validator node...');
    return this.createNode({ ...opts, disableValidator: false, validatorPrivateKeys: new SecretValue(privateKeys) });
  }

  private async createNode(opts: Partial<AztecNodeConfig> & { dontStartSequencer?: boolean } = {}) {
    const suffix = (this.nodes.length + 1).toString();
    const { mockGossipSubNetwork } = this.context;
    const resolvedConfig = { ...this.context.config, ...opts };
    const p2pEnabled = resolvedConfig.p2pEnabled || mockGossipSubNetwork !== undefined;
    const p2pIp = resolvedConfig.p2pIp ?? (p2pEnabled ? '127.0.0.1' : undefined);
    const node = await withLogNameSuffix(suffix, () =>
      AztecNodeService.createAndSync(
        {
          ...resolvedConfig,
          dataDirectory: join(this.context.config.dataDirectory!, randomBytes(8).toString('hex')),
          validatorPrivateKeys: opts.validatorPrivateKeys ?? new SecretValue([]),
          p2pEnabled,
          p2pIp,
        },
        {
          dateProvider: this.context.dateProvider,
          p2pClientDeps: {
            p2pServiceFactory: mockGossipSubNetwork ? getMockPubSubP2PServiceFactory(mockGossipSubNetwork) : undefined,
          },
        },
        {
          prefilledPublicData: this.context.prefilledPublicData,
          ...opts,
        },
      ),
    );
    this.nodes.push(node);
    return node;
  }

  private getNextPrivateKey(): Hex {
    const key = getPrivateKeyFromIndex(this.nodes.length + this.proverNodes.length + 1);
    return `0x${key!.toString('hex')}`;
  }

  /** Waits until the epoch begins (ie until the immediately previous L1 block is mined). */
  public async waitUntilEpochStarts(epoch: number) {
    const [start] = getTimestampRangeForEpoch(BigInt(epoch), this.constants);
    this.logger.info(`Waiting until L1 timestamp ${start} is reached as the start of epoch ${epoch}`);
    await waitUntilL1Timestamp(this.l1Client, start - BigInt(this.L1_BLOCK_TIME_IN_S));
    return start;
  }

  /** Waits until the given L2 block number is mined. */
  public async waitUntilL2BlockNumber(target: number, timeout = 60) {
    await retryUntil(
      () => Promise.resolve(target <= this.monitor.l2BlockNumber),
      `Wait until L2 block ${target}`,
      timeout,
      0.1,
    );
  }

  /** Waits until the given L2 block number is marked as proven. */
  public async waitUntilProvenL2BlockNumber(t: number, timeout = 60) {
    await retryUntil(
      () => Promise.resolve(t <= this.monitor.l2ProvenBlockNumber),
      `Wait proven L2 block ${t}`,
      timeout,
      0.1,
    );
    return this.monitor.l2ProvenBlockNumber;
  }

  /** Waits until the last slot of the proof submission window for a given epoch. */
  public async waitUntilLastSlotOfProofSubmissionWindow(epochNumber: number | bigint) {
    const deadline = getProofSubmissionDeadlineTimestamp(BigInt(epochNumber), this.constants);
    const oneSlotBefore = deadline - BigInt(this.constants.slotDuration);
    const date = new Date(Number(oneSlotBefore) * 1000);
    this.logger.info(`Waiting until last slot of submission window for epoch ${epochNumber} at ${date}`, {
      oneSlotBefore,
    });
    await waitUntilL1Timestamp(this.l1Client, oneSlotBefore);
  }

  /** Waits for the aztec node to sync to the target block number. */
  public async waitForNodeToSync(blockNumber: number, type: 'proven' | 'finalised' | 'historic') {
    const waitTime = ARCHIVER_POLL_INTERVAL + WORLD_STATE_BLOCK_CHECK_INTERVAL;
    let synched = false;
    while (!synched) {
      await sleep(waitTime);
      const [syncState, tips] = await Promise.all([
        this.context.aztecNode.getWorldStateSyncStatus(),
        await this.context.aztecNode.getL2Tips(),
      ]);
      this.logger.info(`Wait for node synch ${blockNumber} ${type}`, { blockNumber, type, syncState, tips });
      if (type === 'proven') {
        synched = tips.proven.number >= blockNumber && syncState.latestBlockNumber >= blockNumber;
      } else if (type === 'finalised') {
        synched = syncState.finalisedBlockNumber >= blockNumber;
      } else {
        synched = syncState.oldestHistoricBlockNumber >= blockNumber;
      }
    }
  }

  /** Registers the SpamContract on the given wallet. */
  public async registerSpamContract(wallet: Wallet, salt = Fr.ZERO) {
    const instance = await getContractInstanceFromDeployParams(SpamContract.artifact, {
      constructorArgs: [],
      constructorArtifact: undefined,
      salt,
      publicKeys: undefined,
      deployer: undefined,
    });
    await wallet.registerContract({ artifact: SpamContract.artifact, instance });
    return SpamContract.at(instance.address, wallet);
  }

  /** Creates an L1 client using a fresh account with funds from anvil, with a tx delayer already set up. */
  public async createL1Client() {
    const { client, delayer } = withDelayer(
      createExtendedL1Client(
        [...this.l1Client.chain.rpcUrls.default.http],
        privateKeyToAccount(this.getNextPrivateKey()),
        this.l1Client.chain,
      ),
      { ethereumSlotDuration: this.L1_BLOCK_TIME_IN_S },
    );
    expect(await client.getBalance({ address: client.account.address })).toBeGreaterThan(0n);
    return { client, delayer };
  }

  /** Verifies whether the given block number is found on the aztec node. */
  public async verifyHistoricBlock(blockNumber: L2BlockNumber, expectedSuccess: boolean) {
    // We use `findLeavesIndexes` here, but could use any function that queries the world-state
    // at a particular block, so we know whether that historic block is available or has been
    // pruned. Note that `getBlock` would not work here, since it only hits the archiver.
    const result = await this.context.aztecNode
      .findLeavesIndexes(blockNumber, MerkleTreeId.NULLIFIER_TREE, [Fr.ZERO])
      .then(_ => true)
      .catch(_ => false);
    expect(result).toBe(expectedSuccess);
  }
}
