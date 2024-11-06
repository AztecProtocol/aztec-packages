import { type BBProverConfig } from '@aztec/bb-prover';
import {
  type MerkleTreeWriteOperations,
  type ProcessedTx,
  type ProcessedTxHandler,
  type PublicExecutionRequest,
  type ServerCircuitProver,
  type Tx,
  type TxValidator,
} from '@aztec/circuit-types';
import { type Gas, type GlobalVariables, Header } from '@aztec/circuits.js';
import { type Fr } from '@aztec/foundation/fields';
import { type DebugLogger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/utils';
import {
  type PublicExecutionResult,
  PublicExecutionResultBuilder,
  type PublicExecutor,
  PublicProcessor,
  RealPublicKernelCircuitSimulator,
  type SimulationProvider,
  WASMSimulator,
  type WorldStateDB,
} from '@aztec/simulator';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { MerkleTrees } from '@aztec/world-state';
import { NativeWorldStateService } from '@aztec/world-state/native';

import * as fs from 'fs/promises';
import { type MockProxy, mock } from 'jest-mock-extended';

import { TestCircuitProver } from '../../../bb-prover/src/test/test_circuit_prover.js';
import { type AvmPersistableStateManager } from '../../../simulator/src/avm/journal/journal.js';
import { ProvingOrchestrator } from '../orchestrator/index.js';
import { MemoryProvingQueue } from '../prover-agent/memory-proving-queue.js';
import { ProverAgent } from '../prover-agent/prover-agent.js';
import { getEnvironmentConfig, getSimulationProvider, makeGlobals } from './fixtures.js';

export class TestContext {
  constructor(
    public publicExecutor: MockProxy<PublicExecutor>,
    public worldStateDB: MockProxy<WorldStateDB>,
    public publicProcessor: PublicProcessor,
    public simulationProvider: SimulationProvider,
    public globalVariables: GlobalVariables,
    public actualDb: MerkleTreeWriteOperations,
    public prover: ServerCircuitProver,
    public proverAgent: ProverAgent,
    public orchestrator: ProvingOrchestrator,
    public blockNumber: number,
    public directoriesToCleanup: string[],
    public logger: DebugLogger,
  ) {}

  public get epochProver() {
    return this.orchestrator;
  }

  static async new(
    logger: DebugLogger,
    worldState: 'native' | 'legacy' = 'native',
    proverCount = 4,
    createProver: (bbConfig: BBProverConfig) => Promise<ServerCircuitProver> = _ =>
      Promise.resolve(new TestCircuitProver(new NoopTelemetryClient(), new WASMSimulator())),
    blockNumber = 3,
  ) {
    const directoriesToCleanup: string[] = [];
    const globalVariables = makeGlobals(blockNumber);

    const publicExecutor = mock<PublicExecutor>();
    const worldStateDB = mock<WorldStateDB>();
    const publicKernel = new RealPublicKernelCircuitSimulator(new WASMSimulator());
    const telemetry = new NoopTelemetryClient();

    // Separated dbs for public processor and prover - see public_processor for context
    let publicDb: MerkleTreeWriteOperations;
    let proverDb: MerkleTreeWriteOperations;

    if (worldState === 'native') {
      const ws = await NativeWorldStateService.tmp();
      publicDb = await ws.fork();
      proverDb = await ws.fork();
    } else {
      const ws = await MerkleTrees.new(openTmpStore(), telemetry);
      publicDb = await ws.getLatest();
      proverDb = await ws.getLatest();
    }

    const processor = PublicProcessor.create(
      publicDb,
      publicExecutor,
      publicKernel,
      globalVariables,
      Header.empty(),
      worldStateDB,
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
    const orchestrator = new ProvingOrchestrator(proverDb, queue, telemetry);
    const agent = new ProverAgent(localProver, proverCount);

    queue.start();
    agent.start(queue);

    return new this(
      publicExecutor,
      worldStateDB,
      processor,
      simulationProvider,
      globalVariables,
      proverDb,
      localProver,
      agent,
      orchestrator,
      blockNumber,
      directoriesToCleanup,
      logger,
    );
  }

  async cleanup() {
    await this.proverAgent.stop();
    for (const dir of this.directoriesToCleanup.filter(x => x !== '')) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  public async processPublicFunctions(
    txs: Tx[],
    maxTransactions: number,
    txHandler?: ProcessedTxHandler,
    txValidator?: TxValidator<ProcessedTx>,
  ) {
    const defaultExecutorImplementation = (
      _stateManager: AvmPersistableStateManager,
      execution: PublicExecutionRequest,
      _globalVariables: GlobalVariables,
      allocatedGas: Gas,
      _transactionFee?: Fr,
    ) => {
      for (const tx of txs) {
        const allCalls = tx.publicTeardownFunctionCall.isEmpty()
          ? tx.enqueuedPublicFunctionCalls
          : [...tx.enqueuedPublicFunctionCalls, tx.publicTeardownFunctionCall];
        for (const request of allCalls) {
          if (execution.callContext.equals(request.callContext)) {
            const result = PublicExecutionResultBuilder.empty().build({
              endGasLeft: allocatedGas,
            });
            return Promise.resolve(result);
          }
        }
      }
      throw new Error(`Unexpected execution request: ${execution}`);
    };
    return await this.processPublicFunctionsWithMockExecutorImplementation(
      txs,
      maxTransactions,
      txHandler,
      txValidator,
      defaultExecutorImplementation,
    );
  }

  public async processPublicFunctionsWithMockExecutorImplementation(
    txs: Tx[],
    maxTransactions: number,
    txHandler?: ProcessedTxHandler,
    txValidator?: TxValidator<ProcessedTx>,
    executorMock?: (
      stateManager: AvmPersistableStateManager,
      execution: PublicExecutionRequest,
      globalVariables: GlobalVariables,
      allocatedGas: Gas,
      transactionFee?: Fr,
    ) => Promise<PublicExecutionResult>,
  ) {
    if (executorMock) {
      this.publicExecutor.simulate.mockImplementation(executorMock);
    }
    return await this.publicProcessor.process(txs, maxTransactions, txHandler, txValidator);
  }
}
