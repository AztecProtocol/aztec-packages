import { type BBProverConfig } from '@aztec/bb-prover';
import {
  type L2Block,
  type ProcessedTx,
  type ProcessedTxHandler,
  type PublicExecutionRequest,
  type ServerCircuitProver,
  type Tx,
  type TxValidator,
} from '@aztec/circuit-types';
import { makeBloatedProcessedTx } from '@aztec/circuit-types/test';
import { type AppendOnlyTreeSnapshot, BlockHeader, type Gas, type GlobalVariables } from '@aztec/circuits.js';
import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { type DebugLogger } from '@aztec/foundation/log';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import {
  PublicProcessor,
  PublicTxSimulator,
  type SimulationProvider,
  WASMSimulator,
  type WorldStateDB,
} from '@aztec/simulator';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { type MerkleTreeAdminDatabase } from '@aztec/world-state';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import { mock } from 'jest-mock-extended';

import { TestCircuitProver } from '../../../bb-prover/src/test/test_circuit_prover.js';
import { AvmFinalizedCallResult } from '../../../simulator/src/avm/avm_contract_call_result.js';
import { type AvmPersistableStateManager } from '../../../simulator/src/avm/journal/journal.js';
import { buildBlock } from '../block_builder/light.js';
import { ProvingOrchestrator } from '../orchestrator/index.js';
import { MemoryProvingQueue } from '../prover-agent/memory-proving-queue.js';
import { ProverAgent } from '../prover-agent/prover-agent.js';
import { getEnvironmentConfig, getSimulationProvider, makeGlobals } from './fixtures.js';

export class TestContext {
  private headers: Map<number, BlockHeader> = new Map();

  constructor(
    public publicTxSimulator: PublicTxSimulator,
    public worldState: MerkleTreeAdminDatabase,
    public publicProcessor: PublicProcessor,
    public simulationProvider: SimulationProvider,
    public globalVariables: GlobalVariables,
    public prover: ServerCircuitProver,
    public proverAgent: ProverAgent,
    public orchestrator: TestProvingOrchestrator,
    public blockNumber: number,
    public directoriesToCleanup: string[],
    public logger: DebugLogger,
  ) {}

  public get epochProver() {
    return this.orchestrator;
  }

  static async new(
    logger: DebugLogger,
    proverCount = 4,
    createProver: (bbConfig: BBProverConfig) => Promise<ServerCircuitProver> = _ =>
      Promise.resolve(new TestCircuitProver(new NoopTelemetryClient(), new WASMSimulator())),
    blockNumber = 1,
  ) {
    const directoriesToCleanup: string[] = [];
    const globalVariables = makeGlobals(blockNumber);

    const worldStateDB = mock<WorldStateDB>();
    const telemetry = new NoopTelemetryClient();

    // Separated dbs for public processor and prover - see public_processor for context
    const ws = await NativeWorldStateService.tmp();
    const publicDb = await ws.fork();

    worldStateDB.getMerkleInterface.mockReturnValue(publicDb);

    const publicTxSimulator = new PublicTxSimulator(publicDb, worldStateDB, telemetry, globalVariables);
    const processor = new PublicProcessor(
      publicDb,
      globalVariables,
      BlockHeader.empty(),
      worldStateDB,
      publicTxSimulator,
      telemetry,
    );

    let localProver: ServerCircuitProver;
    const config = await getEnvironmentConfig(logger);
    const simulationProvider = await getSimulationProvider({
      acvmWorkingDirectory: config?.acvmWorkingDirectory,
      acvmBinaryPath: config?.expectedAcvmPath,
    });
    if (!config) {
      localProver = new TestCircuitProver(new NoopTelemetryClient(), simulationProvider);
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

    const queue = new MemoryProvingQueue(telemetry);
    const orchestrator = new TestProvingOrchestrator(ws, queue, telemetry, Fr.ZERO);
    const agent = new ProverAgent(localProver, proverCount);

    queue.start();
    agent.start(queue);

    return new this(
      publicTxSimulator,
      ws,
      processor,
      simulationProvider,
      globalVariables,
      localProver,
      agent,
      orchestrator,
      blockNumber,
      directoriesToCleanup,
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

  async cleanup() {
    await this.proverAgent.stop();
    for (const dir of this.directoriesToCleanup.filter(x => x !== '')) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  public makeProcessedTx(opts?: Parameters<typeof makeBloatedProcessedTx>[0]): ProcessedTx;
  public makeProcessedTx(seed?: number): ProcessedTx;
  public makeProcessedTx(seedOrOpts?: Parameters<typeof makeBloatedProcessedTx>[0] | number): ProcessedTx {
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
    const txs = times(numTxs, i =>
      this.makeProcessedTx({ seed: i + blockNum * 1000, globalVariables, ...makeProcessedTxOpts(i) }),
    );

    const block = await buildBlock(txs, globalVariables, msgs, db);
    this.headers.set(blockNum, block.header);
    await this.worldState.handleL2BlockAndMessages(block, msgs);
    return { block, txs, msgs };
  }

  public async processPublicFunctions(
    txs: Tx[],
    maxTransactions: number,
    txHandler?: ProcessedTxHandler,
    txValidator?: TxValidator<ProcessedTx>,
  ) {
    const defaultExecutorImplementation = (
      _stateManager: AvmPersistableStateManager,
      executionRequest: PublicExecutionRequest,
      allocatedGas: Gas,
      _transactionFee: Fr,
      _fnName: string,
    ) => {
      for (const tx of txs) {
        const allCalls = tx.publicTeardownFunctionCall.isEmpty()
          ? tx.enqueuedPublicFunctionCalls
          : [...tx.enqueuedPublicFunctionCalls, tx.publicTeardownFunctionCall];
        for (const request of allCalls) {
          if (executionRequest.callContext.equals(request.callContext)) {
            return Promise.resolve(
              new AvmFinalizedCallResult(/*reverted=*/ false, /*output=*/ [], /*gasLeft=*/ allocatedGas),
            );
          }
        }
      }
      throw new Error(`Unexpected execution request: ${executionRequest}`);
    };
    return await this.processPublicFunctionsWithMockExecutorImplementation(
      txs,
      maxTransactions,
      txHandler,
      txValidator,
      defaultExecutorImplementation,
    );
  }

  private async processPublicFunctionsWithMockExecutorImplementation(
    txs: Tx[],
    maxTransactions: number,
    txHandler?: ProcessedTxHandler,
    txValidator?: TxValidator<ProcessedTx>,
    executorMock?: (
      stateManager: AvmPersistableStateManager,
      executionRequest: PublicExecutionRequest,
      allocatedGas: Gas,
      transactionFee: Fr,
      fnName: string,
    ) => Promise<AvmFinalizedCallResult>,
  ) {
    // Mock the internal private function. Borrowed from https://stackoverflow.com/a/71033167
    const simulateInternal: jest.SpiedFunction<
      (
        stateManager: AvmPersistableStateManager,
        executionResult: any,
        allocatedGas: Gas,
        transactionFee: any,
        fnName: any,
      ) => Promise<AvmFinalizedCallResult>
    > = jest.spyOn(
      this.publicTxSimulator as unknown as {
        simulateEnqueuedCallInternal: PublicTxSimulator['simulateEnqueuedCallInternal'];
      },
      'simulateEnqueuedCallInternal',
    );
    if (executorMock) {
      simulateInternal.mockImplementation(executorMock);
    }
    return await this.publicProcessor.process(txs, maxTransactions, txHandler, txValidator);
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
