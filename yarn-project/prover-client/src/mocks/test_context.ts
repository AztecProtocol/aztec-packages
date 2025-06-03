import type { BBProverConfig } from '@aztec/bb-prover';
import { times, timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import type { Logger } from '@aztec/foundation/log';
import { TestDateProvider } from '@aztec/foundation/timer';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import { PublicTxSimulationTester, SimpleContractDataSource } from '@aztec/simulator/public/fixtures';
import { PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2Block } from '@aztec/stdlib/block';
import type { ServerCircuitProver } from '@aztec/stdlib/interfaces/server';
import { makeBloatedProcessedTx } from '@aztec/stdlib/testing';
import { type AppendOnlyTreeSnapshot, PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import { type BlockHeader, type GlobalVariables, type ProcessedTx, TreeSnapshots, type Tx } from '@aztec/stdlib/tx';
import type { MerkleTreeAdminDatabase } from '@aztec/world-state';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { promises as fs } from 'fs';

// TODO(#12613) This means of sharing test code is not ideal.
// eslint-disable-next-line import/no-relative-packages
import { TestCircuitProver } from '../../../bb-prover/src/test/test_circuit_prover.js';
import { buildBlock } from '../block_builder/light.js';
import { ProvingOrchestrator } from '../orchestrator/index.js';
import { BrokerCircuitProverFacade } from '../proving_broker/broker_prover_facade.js';
import { TestBroker } from '../test/mock_prover.js';
import { getEnvironmentConfig, getSimulator, makeGlobals, updateExpectedTreesFromTxs } from './fixtures.js';

export class TestContext {
  private headers: Map<number, BlockHeader> = new Map();
  private feePayerBalance: Fr;

  constructor(
    public worldState: MerkleTreeAdminDatabase,
    public publicProcessor: PublicProcessor,
    public globalVariables: GlobalVariables,
    public prover: ServerCircuitProver,
    public broker: TestBroker,
    public brokerProverFacade: BrokerCircuitProverFacade,
    public orchestrator: TestProvingOrchestrator,
    public blockNumber: number,
    public feePayer: AztecAddress,
    initialFeePayerBalance: Fr,
    public directoriesToCleanup: string[],
    public tester: PublicTxSimulationTester,
    public logger: Logger,
  ) {
    this.feePayerBalance = initialFeePayerBalance;
  }

  public get epochProver() {
    return this.orchestrator;
  }

  static async new(
    logger: Logger,
    proverCount = 4,
    createProver: (bbConfig: BBProverConfig) => Promise<ServerCircuitProver> = async (bbConfig: BBProverConfig) =>
      new TestCircuitProver(await getSimulator(bbConfig, logger)),
    blockNumber = 1,
  ) {
    const directoriesToCleanup: string[] = [];
    const globalVariables = makeGlobals(blockNumber);

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
    const merkleTrees = await ws.fork();

    const contractDataSource = new SimpleContractDataSource();
    const tester = new PublicTxSimulationTester(merkleTrees, contractDataSource);

    const processorFactory = new PublicProcessorFactory(contractDataSource, new TestDateProvider());
    const processor = processorFactory.create(merkleTrees, globalVariables, /*skipFeeEnforcement=*/ false);

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
      };
      localProver = await createProver(bbConfig);
    }

    if (config?.directoryToCleanup && !config.bbSkipCleanup) {
      directoriesToCleanup.push(config.directoryToCleanup);
    }

    const broker = new TestBroker(proverCount, localProver);
    const facade = new BrokerCircuitProverFacade(broker);
    const orchestrator = new TestProvingOrchestrator(ws, facade, Fr.ZERO);

    await broker.start();
    facade.start();

    return new this(
      ws,
      processor,
      globalVariables,
      localProver,
      broker,
      facade,
      orchestrator,
      blockNumber,
      feePayer,
      initialFeePayerBalance,
      directoriesToCleanup,
      tester,
      logger,
    );
  }

  public getFork() {
    return this.worldState.fork();
  }

  public getBlockHeader(blockNumber: 0): BlockHeader;
  public getBlockHeader(blockNumber: number): BlockHeader | undefined;
  public getBlockHeader(blockNumber = 0) {
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

  public async makeProcessedTx(opts?: Parameters<typeof makeBloatedProcessedTx>[0]): Promise<ProcessedTx>;
  public async makeProcessedTx(seed?: number): Promise<ProcessedTx>;
  public async makeProcessedTx(
    seedOrOpts?: Parameters<typeof makeBloatedProcessedTx>[0] | number,
  ): Promise<ProcessedTx> {
    const opts = typeof seedOrOpts === 'number' ? { seed: seedOrOpts } : seedOrOpts;
    const blockNum = (opts?.globalVariables ?? this.globalVariables).blockNumber.toNumber();
    const header = this.getBlockHeader(blockNum - 1);
    const tx = await makeBloatedProcessedTx({
      header,
      vkTreeRoot: getVKTreeRoot(),
      protocolContractTreeRoot,
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
    numMsgs: number = 0,
    blockNumOrGlobals: GlobalVariables | number = this.globalVariables,
    makeProcessedTxOpts: (index: number) => Partial<Parameters<typeof makeBloatedProcessedTx>[0]> = () => ({}),
  ) {
    const globalVariables = typeof blockNumOrGlobals === 'number' ? makeGlobals(blockNumOrGlobals) : blockNumOrGlobals;
    const blockNum = globalVariables.blockNumber.toNumber();
    const db = await this.worldState.fork();
    const msgs = times(numMsgs, i => new Fr(blockNum * 100 + i));
    const txs = await timesParallel(numTxs, i =>
      this.makeProcessedTx({ seed: i + blockNum * 1000, globalVariables, ...makeProcessedTxOpts(i) }),
    );
    await this.setTreeRoots(txs);

    const block = await buildBlock(txs, globalVariables, msgs, db);
    this.headers.set(blockNum, block.header);
    await this.worldState.handleL2BlockAndMessages(block, msgs);
    return { block, txs, msgs };
  }

  public async processPublicFunctions(txs: Tx[], maxTransactions: number) {
    return await this.publicProcessor.process(txs, { maxTransactions });
  }

  public async setTreeRoots(txs: ProcessedTx[]) {
    const db = await this.worldState.fork();
    for (const tx of txs) {
      const startStateReference = await db.getStateReference();
      await updateExpectedTreesFromTxs(db, [tx]);
      const endStateReference = await db.getStateReference();
      if (tx.avmProvingRequest) {
        tx.avmProvingRequest.inputs.publicInputs.startTreeSnapshots = new TreeSnapshots(
          startStateReference.l1ToL2MessageTree,
          startStateReference.partial.noteHashTree,
          startStateReference.partial.nullifierTree,
          startStateReference.partial.publicDataTree,
        );
        tx.avmProvingRequest.inputs.publicInputs.endTreeSnapshots = new TreeSnapshots(
          endStateReference.l1ToL2MessageTree,
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
  protected override verifyBuiltBlockAgainstSyncedState(
    l2Block: L2Block,
    newArchive: AppendOnlyTreeSnapshot,
  ): Promise<void> {
    if (this.isVerifyBuiltBlockAgainstSyncedStateEnabled) {
      return super.verifyBuiltBlockAgainstSyncedState(l2Block, newArchive);
    }
    return Promise.resolve();
  }
}
