import { Fr, type Logger, getTimestampRangeForEpoch, retryUntil, sleep } from '@aztec/aztec.js';
import { ChainMonitor } from '@aztec/aztec.js/ethereum';
// eslint-disable-next-line no-restricted-imports
import { type L1RollupConstants, MerkleTreeId } from '@aztec/circuit-types';
import { type L2BlockNumber } from '@aztec/circuit-types/interfaces/client';
import { RollupContract } from '@aztec/ethereum/contracts';
import { DelayedTxUtils, type Delayer, waitUntilL1Timestamp } from '@aztec/ethereum/test';
import { randomBytes } from '@aztec/foundation/crypto';
import { withLogNameSuffix } from '@aztec/foundation/log';
import { ProverNode, ProverNodePublisher } from '@aztec/prover-node';
import { type TestProverNode } from '@aztec/prover-node/test';
import { type SequencerPublisher } from '@aztec/sequencer-client';
import { type TestSequencerClient } from '@aztec/sequencer-client/test';

import { join } from 'path';
import { type Hex, type PublicClient } from 'viem';

import { type EndToEndContext, createAndSyncProverNode, getPrivateKeyFromIndex, setup } from '../fixtures/utils.js';

export const EPOCH_DURATION_IN_L2_SLOTS = 4;
export const L2_SLOT_DURATION_IN_L1_SLOTS = 2;
export const L1_BLOCK_TIME_IN_S = process.env.L1_BLOCK_TIME ? parseInt(process.env.L1_BLOCK_TIME) : 8;
export const WORLD_STATE_BLOCK_HISTORY = 2;
export const WORLD_STATE_BLOCK_CHECK_INTERVAL = 50;
export const ARCHIVER_POLL_INTERVAL = 50;

/**
 * Tests building of epochs using fast block times and short epochs.
 * Spawns an aztec node and a prover node with fake proofs.
 * Sequencer is allowed to build empty blocks.
 */
export class EpochsTestContext {
  public context!: EndToEndContext;
  public l1Client!: PublicClient;
  public rollup!: RollupContract;
  public constants!: L1RollupConstants;
  public logger!: Logger;
  public monitor!: ChainMonitor;
  public proverDelayer!: Delayer;
  public sequencerDelayer!: Delayer;

  public proverNodes: ProverNode[] = [];

  public static async setup() {
    const test = new EpochsTestContext();
    await test.setup();
    return test;
  }

  public async setup() {
    // Set up system without any account nor protocol contracts
    // and with faster block times and shorter epochs.
    const context = await setup(0, {
      assumeProvenThrough: undefined,
      checkIntervalMs: 50,
      archiverPollingIntervalMS: ARCHIVER_POLL_INTERVAL,
      worldStateBlockCheckIntervalMS: WORLD_STATE_BLOCK_CHECK_INTERVAL,
      skipProtocolContracts: true,
      salt: 1,
      aztecEpochDuration: EPOCH_DURATION_IN_L2_SLOTS,
      aztecSlotDuration: L1_BLOCK_TIME_IN_S * L2_SLOT_DURATION_IN_L1_SLOTS,
      ethereumSlotDuration: L1_BLOCK_TIME_IN_S,
      aztecProofSubmissionWindow: EPOCH_DURATION_IN_L2_SLOTS * 2 - 1,
      minTxsPerBlock: 0,
      realProofs: false,
      startProverNode: true,
      // We use numeric incremental prover ids for simplicity, but we can switch to
      // using the prover's eth address if the proverId is used for something in the rollup contract
      proverId: Fr.fromString('1'),
      // This must be enough so that the tx from the prover is delayed properly,
      // but not so much to hang the sequencer and timeout the teardown
      txPropagationMaxQueryAttempts: 12,
      worldStateBlockHistory: WORLD_STATE_BLOCK_HISTORY,
    });

    this.context = context;
    this.proverNodes = [context.proverNode!];
    this.logger = context.logger;
    this.l1Client = context.deployL1ContractsValues.publicClient;
    this.rollup = RollupContract.getFromConfig(context.config);

    // Loop that tracks L1 and L2 block numbers and logs whenever there's a new one.
    this.monitor = new ChainMonitor(this.rollup, this.logger);
    this.monitor.start();

    // This is hideous.
    // We ought to have a definite reference to the l1TxUtils that we're using in both places, provided by the test context.
    this.proverDelayer = (
      ((context.proverNode as TestProverNode).publisher as ProverNodePublisher).l1TxUtils as DelayedTxUtils
    ).delayer!;
    this.sequencerDelayer = (
      ((context.sequencer as TestSequencerClient).sequencer.publisher as SequencerPublisher).l1TxUtils as DelayedTxUtils
    ).delayer!;
    if (!this.proverDelayer || !this.sequencerDelayer) {
      throw new Error(`Could not find prover or sequencer delayer`);
    }

    // Constants used for time calculation
    this.constants = {
      epochDuration: EPOCH_DURATION_IN_L2_SLOTS,
      slotDuration: L1_BLOCK_TIME_IN_S * L2_SLOT_DURATION_IN_L1_SLOTS,
      l1StartBlock: await this.rollup.getL1StartBlock(),
      l1GenesisTime: await this.rollup.getL1GenesisTime(),
      ethereumSlotDuration: L1_BLOCK_TIME_IN_S,
    };

    this.logger.info(
      `L2 genesis at L1 block ${this.constants.l1StartBlock} (timestamp ${this.constants.l1GenesisTime})`,
    );
  }

  public async teardown() {
    this.monitor.stop();
    await Promise.all(this.proverNodes.map(node => node.stop()));
    await this.context.teardown();
  }

  public async createProverNode() {
    this.logger.verbose('Creating and syncing a simulated prover node...');
    const proverNodePrivateKey = getPrivateKeyFromIndex(this.proverNodes.length + 1);
    const proverNodePrivateKeyHex: Hex = `0x${proverNodePrivateKey!.toString('hex')}`;
    const suffix = (this.proverNodes.length + 1).toString();
    const proverNode = await withLogNameSuffix(suffix, () =>
      createAndSyncProverNode(
        proverNodePrivateKeyHex,
        { ...this.context.config, proverId: Fr.fromString(suffix) },
        this.context.aztecNode,
        join(this.context.config.dataDirectory!, randomBytes(8).toString('hex')),
      ),
    );
    this.proverNodes.push(proverNode);
    return proverNode;
  }

  /** Waits until the epoch begins (ie until the immediately previous L1 block is mined). */
  public async waitUntilEpochStarts(epoch: number) {
    const [start] = getTimestampRangeForEpoch(BigInt(epoch), this.constants);
    this.logger.info(`Waiting until L1 timestamp ${start} is reached as the start of epoch ${epoch}`);
    await waitUntilL1Timestamp(this.l1Client, start - BigInt(L1_BLOCK_TIME_IN_S));
    return start;
  }

  /** Waits until the given L2 block number is mined. */
  public async waitUntilL2BlockNumber(target: number) {
    await retryUntil(
      () => Promise.resolve(target === this.monitor.l2BlockNumber),
      `Wait until L2 block ${target}`,
      60,
      0.1,
    );
  }

  /** Waits until the given L2 block number is marked as proven. */
  public async waitUntilProvenL2BlockNumber(t: number, timeout = 60) {
    await retryUntil(
      () => Promise.resolve(t === this.monitor.l2ProvenBlockNumber),
      `Wait proven L2 block ${t}`,
      timeout,
      0.1,
    );
  }

  /** Waits for the aztec node to sync to the target block number. */
  public async waitForNodeToSync(blockNumber: number, type: 'finalised' | 'historic') {
    const waitTime = ARCHIVER_POLL_INTERVAL + WORLD_STATE_BLOCK_CHECK_INTERVAL;
    let synched = false;
    while (!synched) {
      await sleep(waitTime);
      const syncState = await this.context.aztecNode.getWorldStateSyncStatus();
      if (type === 'finalised') {
        synched = syncState.finalisedBlockNumber >= blockNumber;
      } else {
        synched = syncState.oldestHistoricBlockNumber >= blockNumber;
      }
    }
  }

  /** Verifies whether the given block number is found on the aztec node. */
  public async verifyHistoricBlock(blockNumber: L2BlockNumber, expectedSuccess: boolean) {
    const result = await this.context.aztecNode
      .findBlockNumbersForIndexes(blockNumber, MerkleTreeId.NULLIFIER_TREE, [0n])
      .then(_ => true)
      .catch(_ => false);
    expect(result).toBe(expectedSuccess);
  }
}
