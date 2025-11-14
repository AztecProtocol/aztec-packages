import type { BBProverConfig } from '@aztec/bb-prover';
import { TestCircuitProver } from '@aztec/bb-prover';
import { getTotalNumBlobFieldsFromTxs } from '@aztec/blob-lib';
import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { padArrayEnd, times, timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import type { Logger } from '@aztec/foundation/log';
import type { FieldsOf } from '@aztec/foundation/types';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { ProtocolContractsList } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { EthAddress } from '@aztec/stdlib/block';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { MerkleTreeWriteOperations, ServerCircuitProver } from '@aztec/stdlib/interfaces/server';
import type { CheckpointConstantData } from '@aztec/stdlib/rollup';
import { mockProcessedTx } from '@aztec/stdlib/testing';
import { MerkleTreeId, PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import {
  type BlockHeader,
  type GlobalVariables,
  type ProcessedTx,
  StateReference,
  TreeSnapshots,
} from '@aztec/stdlib/tx';
import type { MerkleTreeAdminDatabase } from '@aztec/world-state';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { promises as fs } from 'fs';

import { LightweightCheckpointBuilder } from '../light/lightweight_checkpoint_builder.js';
import {
  buildFinalBlobChallenges,
  getTreeSnapshot,
  insertSideEffects,
} from '../orchestrator/block-building-helpers.js';
import type { BlockProvingState } from '../orchestrator/block-proving-state.js';
import { ProvingOrchestrator } from '../orchestrator/index.js';
import { BrokerCircuitProverFacade } from '../proving_broker/broker_prover_facade.js';
import { TestBroker } from '../test/mock_prover.js';
import { getEnvironmentConfig, getSimulator, makeCheckpointConstants, makeGlobals } from './fixtures.js';

export class TestContext {
  private headers: Map<number, BlockHeader> = new Map();
  private checkpoints: Checkpoint[] = [];
  private nextCheckpointIndex = 0;
  private nextBlockNumber = 1;
  private epochNumber = 1;
  private feePayerBalance: Fr;

  constructor(
    public worldState: MerkleTreeAdminDatabase,
    public prover: ServerCircuitProver,
    public broker: TestBroker,
    public brokerProverFacade: BrokerCircuitProverFacade,
    public orchestrator: TestProvingOrchestrator,
    private feePayer: AztecAddress,
    initialFeePayerBalance: Fr,
    private directoriesToCleanup: string[],
    private logger: Logger,
  ) {
    this.feePayerBalance = initialFeePayerBalance;
  }

  public get epochProver() {
    return this.orchestrator;
  }

  static async new(
    logger: Logger,
    {
      proverCount = 4,
      createProver = async (bbConfig: BBProverConfig) => new TestCircuitProver(await getSimulator(bbConfig, logger)),
    }: {
      proverCount?: number;
      createProver?: (bbConfig: BBProverConfig) => Promise<ServerCircuitProver>;
    } = {},
  ) {
    const directoriesToCleanup: string[] = [];

    const feePayer = AztecAddress.fromNumber(42222);
    const initialFeePayerBalance = new Fr(10n ** 20n);
    const feePayerSlot = await computeFeePayerBalanceLeafSlot(feePayer);
    const prefilledPublicData = [new PublicDataTreeLeaf(feePayerSlot, initialFeePayerBalance)];

    // Separated dbs for public processor and prover - see public_processor for context
    const ws = await NativeWorldStateService.tmp(
      /*rollupAddress=*/ undefined,
      /*cleanupTmpDir=*/ true,
      prefilledPublicData,
    );

    let localProver: ServerCircuitProver;
    const config = await getEnvironmentConfig(logger);
    if (!config) {
      localProver = new TestCircuitProver();
    } else {
      const bbConfig: BBProverConfig = {
        acvmBinaryPath: config.expectedAcvmPath,
        acvmWorkingDirectory: config.acvmWorkingDirectory,
        bbBinaryPath: config.expectedBBPath,
        bbWorkingDirectory: config.bbWorkingDirectory,
        bbSkipCleanup: config.bbSkipCleanup,
        numConcurrentIVCVerifiers: 2,
        bbIVCConcurrency: 1,
      };
      localProver = await createProver(bbConfig);
    }

    if (config?.directoryToCleanup && !config.bbSkipCleanup) {
      directoriesToCleanup.push(config.directoryToCleanup);
    }

    const broker = new TestBroker(proverCount, localProver);
    const facade = new BrokerCircuitProverFacade(broker);
    const orchestrator = new TestProvingOrchestrator(ws, facade, EthAddress.ZERO);

    await broker.start();
    facade.start();

    return new this(
      ws,
      localProver,
      broker,
      facade,
      orchestrator,
      feePayer,
      initialFeePayerBalance,
      directoriesToCleanup,
      logger,
    );
  }

  public getFork() {
    return this.worldState.fork();
  }

  async cleanup() {
    await this.brokerProverFacade.stop();
    await this.broker.stop();
    for (const dir of this.directoriesToCleanup.filter(x => x !== '')) {
      try {
        await fs.rm(dir, { recursive: true, force: true, maxRetries: 3 });
      } catch (err) {
        this.logger.warn(`Failed to delete tmp directory $dir}: ${err}`);
      }
    }
  }

  public startNewEpoch() {
    this.checkpoints = [];
    this.nextCheckpointIndex = 0;
    this.epochNumber++;
  }

  // Return blob fields of all checkpoints in the epoch.
  public getBlobFields() {
    return this.checkpoints.map(checkpoint => checkpoint.toBlobFields());
  }

  public async getFinalBlobChallenges() {
    const blobFields = this.getBlobFields();
    return await buildFinalBlobChallenges(blobFields);
  }

  public async makeCheckpoint(
    numBlocks: number,
    {
      numTxsPerBlock = 0,
      numL1ToL2Messages = 0,
      makeProcessedTxOpts = () => ({}),
      ...constantOpts
    }: {
      numTxsPerBlock?: number | number[];
      numL1ToL2Messages?: number;
      makeProcessedTxOpts?: (
        blockGlobalVariables: GlobalVariables,
        txIndex: number,
      ) => Partial<Parameters<typeof mockProcessedTx>[0]>;
    } & Partial<FieldsOf<CheckpointConstantData>> = {},
  ) {
    if (numBlocks === 0) {
      throw new Error(
        'Cannot make a checkpoint with 0 blocks. Crate an empty block (numTxsPerBlock = 0) if there are no txs.',
      );
    }

    const checkpointIndex = this.nextCheckpointIndex++;
    const slotNumber = checkpointIndex + 1;

    const constants = makeCheckpointConstants(slotNumber, constantOpts);

    const fork = await this.worldState.fork();

    // Build l1 to l2 messages.
    const l1ToL2Messages = times(numL1ToL2Messages, i => new Fr(slotNumber * 100 + i));
    await fork.appendLeaves(
      MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
      padArrayEnd<Fr, number>(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP),
    );
    const newL1ToL2Snapshot = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, fork);

    const startBlockNumber = this.nextBlockNumber;
    const previousBlockHeader = this.getBlockHeader(startBlockNumber - 1);

    // Build global variables.
    const blockGlobalVariables = times(numBlocks, i =>
      makeGlobals(startBlockNumber + i, slotNumber, {
        coinbase: constants.coinbase,
        feeRecipient: constants.feeRecipient,
        gasFees: constants.gasFees,
      }),
    );
    this.nextBlockNumber += numBlocks;

    // Build txs.
    let totalTxs = 0;
    const blockEndStates: StateReference[] = [];
    const blockTxs = await timesAsync(numBlocks, async blockIndex => {
      const txIndexOffset = totalTxs;
      const numTxs = typeof numTxsPerBlock === 'number' ? numTxsPerBlock : numTxsPerBlock[blockIndex];
      totalTxs += numTxs;
      const txs = await timesAsync(numTxs, txIndex =>
        this.makeProcessedTx({
          seed: (txIndexOffset + txIndex + 1) * 321 + (checkpointIndex + 1) * 123456 + this.epochNumber * 0x99999,
          globalVariables: blockGlobalVariables[blockIndex],
          anchorBlockHeader: previousBlockHeader,
          newL1ToL2Snapshot,
          ...makeProcessedTxOpts(blockGlobalVariables[blockIndex], txIndexOffset + txIndex),
        }),
      );

      // Insert side effects into the trees.
      const endState = await this.updateTrees(txs, fork);
      blockEndStates.push(endState);

      return txs;
    });

    const cleanFork = await this.worldState.fork();
    const builder = new LightweightCheckpointBuilder(cleanFork);

    const totalNumBlobFields = getTotalNumBlobFieldsFromTxs(
      blockTxs.map(txs => txs.map(tx => tx.txEffect.getTxStartMarker())),
    );
    await builder.startNewCheckpoint(constants, l1ToL2Messages, totalNumBlobFields);

    // Add tx effects to db and build block headers.
    const blocks = [];
    for (let i = 0; i < numBlocks; i++) {
      const isFirstBlock = i === 0;
      const txs = blockTxs[i];
      const state = blockEndStates[i];

      const block = await builder.addBlock(blockGlobalVariables[i], state, txs);

      const header = block.header;
      this.headers.set(block.number, header);

      const blockMsgs = isFirstBlock ? l1ToL2Messages : [];
      await this.worldState.handleL2BlockAndMessages(block, blockMsgs, isFirstBlock);

      blocks.push({ header, txs });
    }

    const checkpoint = await builder.completeCheckpoint();
    this.checkpoints.push(checkpoint);

    return {
      constants,
      header: checkpoint.header,
      blocks,
      l1ToL2Messages,
      totalNumBlobFields,
      previousBlockHeader,
    };
  }

  private async makeProcessedTx(opts: Parameters<typeof mockProcessedTx>[0] = {}): Promise<ProcessedTx> {
    const tx = await mockProcessedTx({
      vkTreeRoot: getVKTreeRoot(),
      protocolContracts: ProtocolContractsList,
      feePayer: this.feePayer,
      ...opts,
    });

    this.feePayerBalance = new Fr(this.feePayerBalance.toBigInt() - tx.txEffect.transactionFee.toBigInt());

    const feePayerSlot = await computeFeePayerBalanceLeafSlot(this.feePayer);
    const feePaymentPublicDataWrite = new PublicDataWrite(feePayerSlot, this.feePayerBalance);
    tx.txEffect.publicDataWrites[0] = feePaymentPublicDataWrite;
    if (tx.avmProvingRequest) {
      tx.avmProvingRequest.inputs.publicInputs.accumulatedData.publicDataWrites[0] = feePaymentPublicDataWrite;
    }

    return tx;
  }

  private getBlockHeader(blockNumber: number): BlockHeader {
    if (blockNumber > 0 && blockNumber >= this.nextBlockNumber) {
      throw new Error(`Block header not built for block number ${blockNumber}.`);
    }
    return blockNumber === 0 ? this.worldState.getCommitted().getInitialHeader() : this.headers.get(blockNumber)!;
  }

  private async updateTrees(txs: ProcessedTx[], fork: MerkleTreeWriteOperations) {
    let startStateReference = await fork.getStateReference();
    let endStateReference = startStateReference;
    for (const tx of txs) {
      await insertSideEffects(tx, fork);
      endStateReference = await fork.getStateReference();

      if (tx.avmProvingRequest) {
        // Update the trees in the avm public inputs so that the proof won't fail.
        const l1ToL2MessageTree = tx.avmProvingRequest.inputs.publicInputs.startTreeSnapshots.l1ToL2MessageTree;
        tx.avmProvingRequest.inputs.publicInputs.startTreeSnapshots = new TreeSnapshots(
          l1ToL2MessageTree,
          startStateReference.partial.noteHashTree,
          startStateReference.partial.nullifierTree,
          startStateReference.partial.publicDataTree,
        );

        tx.avmProvingRequest.inputs.publicInputs.endTreeSnapshots = new TreeSnapshots(
          l1ToL2MessageTree,
          endStateReference.partial.noteHashTree,
          endStateReference.partial.nullifierTree,
          endStateReference.partial.publicDataTree,
        );
      }

      startStateReference = endStateReference;
    }

    return endStateReference;
  }
}

class TestProvingOrchestrator extends ProvingOrchestrator {
  public isVerifyBuiltBlockAgainstSyncedStateEnabled = false;

  // Disable this check by default, since it requires seeding world state with the block being built
  // This is only enabled in some tests with multiple blocks that populate the pending chain via makePendingBlock
  protected override verifyBuiltBlockAgainstSyncedState(provingState: BlockProvingState): Promise<void> {
    if (this.isVerifyBuiltBlockAgainstSyncedStateEnabled) {
      return super.verifyBuiltBlockAgainstSyncedState(provingState);
    }
    return Promise.resolve();
  }
}
