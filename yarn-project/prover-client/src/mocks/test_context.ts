import type { BBProverConfig } from '@aztec/bb-prover';
import { SpongeBlob } from '@aztec/blob-lib';
import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { padArrayEnd, times, timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import type { Logger } from '@aztec/foundation/log';
import { TestDateProvider } from '@aztec/foundation/timer';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { ProtocolContractsList } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import { SimpleContractDataSource } from '@aztec/simulator/public/fixtures';
import { PublicProcessorFactory } from '@aztec/simulator/server';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { EthAddress, getBlockBlobFields } from '@aztec/stdlib/block';
import type { ServerCircuitProver } from '@aztec/stdlib/interfaces/server';
import type { CheckpointConstantData } from '@aztec/stdlib/rollup';
import { makeBloatedProcessedTx } from '@aztec/stdlib/testing';
import { MerkleTreeId, PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import { type BlockHeader, type GlobalVariables, type ProcessedTx, TreeSnapshots, type Tx } from '@aztec/stdlib/tx';
import type { MerkleTreeAdminDatabase } from '@aztec/world-state';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { promises as fs } from 'fs';

// TODO(#12613) This means of sharing test code is not ideal.
// eslint-disable-next-line import/no-relative-packages
import { TestCircuitProver } from '../../../bb-prover/src/test/test_circuit_prover.js';
import { buildBlockWithCleanDB } from '../block-factory/light.js';
import { getTreeSnapshot } from '../orchestrator/block-building-helpers.js';
import type { BlockProvingState } from '../orchestrator/block-proving-state.js';
import { ProvingOrchestrator } from '../orchestrator/index.js';
import { BrokerCircuitProverFacade } from '../proving_broker/broker_prover_facade.js';
import { TestBroker } from '../test/mock_prover.js';
import {
  getEnvironmentConfig,
  getSimulator,
  makeCheckpointConstants,
  makeGlobals,
  updateExpectedTreesFromTxs,
} from './fixtures.js';

export class TestContext {
  private headers: Map<number, BlockHeader> = new Map();
  private feePayerBalance: Fr;

  constructor(
    public worldState: MerkleTreeAdminDatabase,
    public firstCheckpointNumber: Fr,
    public globalVariables: GlobalVariables,
    public prover: ServerCircuitProver,
    public broker: TestBroker,
    public brokerProverFacade: BrokerCircuitProverFacade,
    public orchestrator: TestProvingOrchestrator,
    public blockNumber: number,
    public feePayer: AztecAddress,
    initialFeePayerBalance: Fr,
    public directoriesToCleanup: string[],
    public logger: Logger,
  ) {
    this.feePayerBalance = initialFeePayerBalance;
  }

  public get epochProver() {
    return this.orchestrator;
  }

  public getCheckpointConstants(checkpointIndex = 0): CheckpointConstantData {
    return makeCheckpointConstants(this.firstCheckpointNumber.toNumber() + checkpointIndex);
  }

  static async new(
    logger: Logger,
    {
      proverCount = 4,
      createProver = async (bbConfig: BBProverConfig) => new TestCircuitProver(await getSimulator(bbConfig, logger)),
      slotNumber = 1,
      blockNumber = 1,
    }: {
      proverCount?: number;
      createProver?: (bbConfig: BBProverConfig) => Promise<ServerCircuitProver>;
      slotNumber?: number;
      blockNumber?: number;
    } = {},
  ) {
    const directoriesToCleanup: string[] = [];
    const firstCheckpointNumber = new Fr(slotNumber);
    const globalVariables = makeGlobals(blockNumber, slotNumber);

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
      firstCheckpointNumber,
      globalVariables,
      localProver,
      broker,
      facade,
      orchestrator,
      blockNumber,
      feePayer,
      initialFeePayerBalance,
      directoriesToCleanup,
      logger,
    );
  }

  public getFork() {
    return this.worldState.fork();
  }

  public getBlockHeader(blockNumber: 0): BlockHeader;
  public getBlockHeader(blockNumber: number): BlockHeader | undefined;
  public getBlockHeader(blockNumber = 0): BlockHeader | undefined {
    return blockNumber === 0 ? this.worldState.getCommitted().getInitialHeader() : this.headers.get(blockNumber);
  }

  public getPreviousBlockHeader(currentBlockNumber = this.blockNumber): BlockHeader {
    return this.getBlockHeader(currentBlockNumber - 1)!;
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

  async makeProcessedTx(opts?: Parameters<typeof makeBloatedProcessedTx>[0]): Promise<ProcessedTx> {
    const blockNum = (opts?.globalVariables ?? this.globalVariables).blockNumber;
    const header = opts?.header ?? this.getBlockHeader(blockNum - 1);
    const tx = await makeBloatedProcessedTx({
      header,
      vkTreeRoot: getVKTreeRoot(),
      protocolContracts: ProtocolContractsList,
      globalVariables: this.globalVariables,
      feePayer: this.feePayer,
      ...opts,
    });
    this.feePayerBalance = new Fr(this.feePayerBalance.toBigInt() - tx.txEffect.transactionFee.toBigInt());
    if (opts?.privateOnly) {
      const feePayerSlot = await computeFeePayerBalanceLeafSlot(this.feePayer);
      tx.txEffect.publicDataWrites[0] = new PublicDataWrite(feePayerSlot, this.feePayerBalance);
    }
    return tx;
  }

  /** Creates a block with the given number of txs and adds it to world-state */
  public async makePendingBlock(
    numTxs: number,
    {
      checkpointIndex = 0,
      numL1ToL2Messages = 0,
      blockNumber = this.blockNumber,
      makeProcessedTxOpts = () => ({}),
    }: {
      checkpointIndex?: number;
      numL1ToL2Messages?: number;
      blockNumber?: number;
      makeProcessedTxOpts?: (index: number) => Partial<Parameters<typeof makeBloatedProcessedTx>[0]>;
    } = {},
  ) {
    const slotNumber = this.firstCheckpointNumber.toNumber() + checkpointIndex;
    const globalVariables = makeGlobals(blockNumber, slotNumber);
    const blockNum = globalVariables.blockNumber;
    const db = await this.worldState.fork();
    const l1ToL2Messages = times(numL1ToL2Messages, i => new Fr(blockNum * 100 + i));
    const merkleTrees = await this.worldState.fork();
    await merkleTrees.appendLeaves(
      MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
      padArrayEnd(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP),
    );
    const newL1ToL2Snapshot = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, merkleTrees);
    const txs = await timesParallel(numTxs, i =>
      this.makeProcessedTx({
        seed: i + blockNum * 1000,
        globalVariables,
        newL1ToL2Snapshot,
        ...makeProcessedTxOpts(i),
      }),
    );
    await this.setTreeRoots(txs);

    const block = await buildBlockWithCleanDB(txs, globalVariables, l1ToL2Messages, db);
    this.headers.set(blockNum, block.getBlockHeader());
    await this.worldState.handleL2BlockAndMessages(block, l1ToL2Messages);
    return { block, txs, l1ToL2Messages };
  }

  public async makePendingBlocksInCheckpoint(
    numBlocks: number,
    {
      checkpointIndex = 0,
      numTxsPerBlock = 1,
      numL1ToL2Messages = 0,
      firstBlockNumber = this.blockNumber + checkpointIndex * numBlocks,
      makeProcessedTxOpts = () => ({}),
    }: {
      checkpointIndex?: number;
      numTxsPerBlock?: number | number[];
      numL1ToL2Messages?: number;
      firstBlockNumber?: number;
      makeProcessedTxOpts?: (index: number) => Partial<Parameters<typeof makeBloatedProcessedTx>[0]>;
    } = {},
  ) {
    const slotNumber = this.firstCheckpointNumber.toNumber() + checkpointIndex;
    const l1ToL2Messages = times(numL1ToL2Messages, i => new Fr(slotNumber * 100 + i));
    const merkleTrees = await this.worldState.fork();
    await merkleTrees.appendLeaves(
      MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
      padArrayEnd(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP),
    );
    const newL1ToL2Snapshot = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, merkleTrees);

    const blockGlobalVariables = times(numBlocks, i => makeGlobals(firstBlockNumber + i, slotNumber));
    let totalTxs = 0;
    const blockTxs = await timesParallel(numBlocks, blockIndex => {
      const txIndexOffset = totalTxs;
      const numTxs = typeof numTxsPerBlock === 'number' ? numTxsPerBlock : numTxsPerBlock[blockIndex];
      totalTxs += numTxs;
      return timesParallel(numTxs, txIndex =>
        this.makeProcessedTx({
          seed: (txIndexOffset + txIndex + 1) * 321 + (checkpointIndex + 1) * 123456,
          globalVariables: blockGlobalVariables[blockIndex],
          header: this.getBlockHeader(firstBlockNumber - 1),
          newL1ToL2Snapshot,
          ...makeProcessedTxOpts(txIndexOffset + txIndex),
        }),
      );
    });

    const blockBlobFields = blockTxs.map(txs => getBlockBlobFields(txs.map(tx => tx.txEffect)));
    const totalNumBlobFields = blockBlobFields.reduce((acc, curr) => acc + curr.length, 0);
    const spongeBlobState = SpongeBlob.init(totalNumBlobFields);

    const blocks: { header: BlockHeader; txs: ProcessedTx[] }[] = [];
    for (let i = 0; i < numBlocks; i++) {
      const isFirstBlock = i === 0;
      const blockNumber = firstBlockNumber + i;
      const globalVariables = blockGlobalVariables[i];
      const txs = blockTxs[i];

      await this.setTreeRoots(txs);

      const fork = await this.worldState.fork();
      const blockMsgs = isFirstBlock ? l1ToL2Messages : [];
      const block = await buildBlockWithCleanDB(txs, globalVariables, blockMsgs, fork, spongeBlobState, isFirstBlock);

      const header = block.getBlockHeader();
      this.headers.set(blockNumber, header);

      await this.worldState.handleL2BlockAndMessages(block, blockMsgs, isFirstBlock);

      await spongeBlobState.absorb(blockBlobFields[i]);

      blocks.push({ header, txs });
    }

    return { blocks, l1ToL2Messages, blobFields: blockBlobFields.flat() };
  }

  public async processPublicFunctions(
    txs: Tx[],
    {
      maxTransactions = txs.length,
      numL1ToL2Messages = 0,
      contractDataSource,
    }: {
      maxTransactions?: number;
      numL1ToL2Messages?: number;
      contractDataSource?: SimpleContractDataSource;
    } = {},
  ) {
    const l1ToL2Messages = times(numL1ToL2Messages, i => new Fr(this.blockNumber * 100 + i));
    const merkleTrees = await this.worldState.fork();
    await merkleTrees.appendLeaves(
      MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
      padArrayEnd(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP),
    );

    const processorFactory = new PublicProcessorFactory(
      contractDataSource ?? new SimpleContractDataSource(),
      new TestDateProvider(),
    );
    const publicProcessor = processorFactory.create(merkleTrees, this.globalVariables, {
      skipFeeEnforcement: false,
      clientInitiatedSimulation: false,
    });

    return await publicProcessor.process(txs, { maxTransactions });
  }

  private async setTreeRoots(txs: ProcessedTx[]) {
    const db = await this.worldState.fork();
    for (const tx of txs) {
      const startStateReference = await db.getStateReference();
      await updateExpectedTreesFromTxs(db, [tx]);
      const endStateReference = await db.getStateReference();
      if (tx.avmProvingRequest) {
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
    }
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
