import { type BBProverConfig } from '@aztec/bb-prover';
import { type L2Block, MerkleTreeId, type ProcessedTx, type ServerCircuitProver, type Tx } from '@aztec/circuit-types';
import { makeBloatedProcessedTx } from '@aztec/circuit-types/test';
import { type AppendOnlyTreeSnapshot, type BlockHeader, type GlobalVariables, TreeSnapshots } from '@aztec/circuits.js';
import { times, timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { type Logger } from '@aztec/foundation/log';
import { TestDateProvider } from '@aztec/foundation/timer';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vks';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { PublicTxSimulationTester } from '@aztec/simulator/public/fixtures';
import {
  PublicProcessor,
  PublicTxSimulator,
  SimpleContractDataSource,
  type SimulationProvider,
  WASMSimulatorWithBlobs,
  WorldStateDB,
} from '@aztec/simulator/server';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { promises as fs } from 'fs';

import { TestCircuitProver } from '../../../bb-prover/src/test/test_circuit_prover.js';
import { buildBlock } from '../block_builder/light.js';
import { ProvingOrchestrator } from '../orchestrator/index.js';
import { BrokerCircuitProverFacade } from '../proving_broker/broker_prover_facade.js';
import { TestBroker } from '../test/mock_prover.js';
import { getEnvironmentConfig, getSimulationProvider, makeGlobals, updateExpectedTreesFromTxs } from './fixtures.js';

export class TestContext {
  private headers: Map<number, BlockHeader> = new Map();

  constructor(
    public publicTxSimulator: PublicTxSimulator,
    public worldState: NativeWorldStateService,
    public publicProcessor: PublicProcessor,
    public simulationProvider: SimulationProvider,
    public globalVariables: GlobalVariables,
    public prover: ServerCircuitProver,
    public broker: TestBroker,
    public brokerProverFacade: BrokerCircuitProverFacade,
    public orchestrator: TestProvingOrchestrator,
    public blockNumber: number,
    public directoriesToCleanup: string[],
    public logger: Logger,
    public tester: PublicTxSimulationTester,
  ) {}

  public get epochProver() {
    return this.orchestrator;
  }

  static async new(
    logger: Logger,
    proverCount = 4,
    createProver: (bbConfig: BBProverConfig) => Promise<ServerCircuitProver> = _ =>
      Promise.resolve(new TestCircuitProver(new WASMSimulatorWithBlobs())),
    blockNumber = 1,
  ) {
    const directoriesToCleanup: string[] = [];
    const globalVariables = makeGlobals(blockNumber);

    // Separated dbs for public processor and prover - see public_processor for context
    const ws = await NativeWorldStateService.tmp();
    const publicDb = await ws.fork();

    logger.error(
      `Starting at nullifier root ${new Fr((await publicDb.getTreeInfo(MerkleTreeId.NULLIFIER_TREE)).root)}`,
    );
    const contractDataSource = new SimpleContractDataSource();
    const worldStateDB = new WorldStateDB(publicDb, contractDataSource);

    const tester = new PublicTxSimulationTester(worldStateDB, contractDataSource, publicDb);

    const publicTxSimulator = new PublicTxSimulator(publicDb, worldStateDB, globalVariables, true);
    const processor = new PublicProcessor(
      publicDb,
      globalVariables,
      worldStateDB,
      publicTxSimulator,
      new TestDateProvider(),
    );

    let localProver: ServerCircuitProver;
    const config = await getEnvironmentConfig(logger);
    const simulationProvider = await getSimulationProvider({
      acvmWorkingDirectory: config?.acvmWorkingDirectory,
      acvmBinaryPath: config?.expectedAcvmPath,
    });
    if (!config) {
      localProver = new TestCircuitProver(simulationProvider);
    } else {
      const bbConfig: BBProverConfig = {
        acvmBinaryPath: config.expectedAcvmPath,
        acvmWorkingDirectory: config.acvmWorkingDirectory,
        bbBinaryPath: config.expectedBBPath,
        bbWorkingDirectory: config.bbWorkingDirectory,
        bbSkipCleanup: config.bbSkipCleanup,
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
      publicTxSimulator,
      ws,
      processor,
      simulationProvider,
      globalVariables,
      localProver,
      broker,
      facade,
      orchestrator,
      blockNumber,
      directoriesToCleanup,
      logger,
      tester,
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
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  public makeProcessedTx(opts?: Parameters<typeof makeBloatedProcessedTx>[0]): Promise<ProcessedTx>;
  public makeProcessedTx(seed?: number): Promise<ProcessedTx>;
  public makeProcessedTx(seedOrOpts?: Parameters<typeof makeBloatedProcessedTx>[0] | number): Promise<ProcessedTx> {
    const opts = typeof seedOrOpts === 'number' ? { seed: seedOrOpts } : seedOrOpts;
    const blockNum = (opts?.globalVariables ?? this.globalVariables).blockNumber.toNumber();
    const header = this.getBlockHeader(blockNum - 1);
    return makeBloatedProcessedTx({
      header,
      vkTreeRoot: getVKTreeRoot(),
      protocolContractTreeRoot,
      globalVariables: this.globalVariables,
      ...opts,
    });
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
