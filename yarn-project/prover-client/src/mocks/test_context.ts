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
import { Fr } from '@aztec/foundation/fields';
import { type DebugLogger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/utils';
import {
  PublicProcessor,
  PublicTxSimulator,
  type SimulationProvider,
  WASMSimulator,
  type WorldStateDB,
} from '@aztec/simulator';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { MerkleTrees } from '@aztec/world-state';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { jest } from '@jest/globals';
import * as fs from 'fs/promises';
import { type MockProxy, mock } from 'jest-mock-extended';

import { TestCircuitProver } from '../../../bb-prover/src/test/test_circuit_prover.js';
import { AvmFinalizedCallResult } from '../../../simulator/src/avm/avm_contract_call_result.js';
import { type AvmPersistableStateManager } from '../../../simulator/src/avm/journal/journal.js';
import { ProvingOrchestrator } from '../orchestrator/index.js';
import { MemoryProvingQueue } from '../prover-agent/memory-proving-queue.js';
import { ProverAgent } from '../prover-agent/prover-agent.js';
import { getEnvironmentConfig, getSimulationProvider, makeGlobals } from './fixtures.js';

export class TestContext {
  constructor(
    public publicTxSimulator: PublicTxSimulator,
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

    const worldStateDB = mock<WorldStateDB>();
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
    worldStateDB.getMerkleInterface.mockReturnValue(publicDb);

    const publicTxSimulator = new PublicTxSimulator(publicDb, worldStateDB, telemetry, globalVariables);
    const processor = new PublicProcessor(
      publicDb,
      globalVariables,
      Header.empty(),
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
    const orchestrator = new ProvingOrchestrator(proverDb, queue, telemetry, Fr.ZERO);
    const agent = new ProverAgent(localProver, proverCount);

    queue.start();
    agent.start(queue);

    return new this(
      publicTxSimulator,
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
