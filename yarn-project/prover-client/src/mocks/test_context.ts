import { type BBProverConfig } from '@aztec/bb-prover';
import {
  type MerkleTreeAdminOperations,
  type ProcessedTx,
  type ProcessedTxHandler,
  type PublicExecutionRequest,
  type ServerCircuitProver,
  type Tx,
  type TxValidator,
} from '@aztec/circuit-types';
import {
  type CombinedConstantData,
  type Gas,
  type GlobalVariables,
  Header,
  type Nullifier,
  type TxContext,
} from '@aztec/circuits.js';
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
import { tmpdir } from 'os';
import { join } from 'path';

import { TestCircuitProver } from '../../../bb-prover/src/test/test_circuit_prover.js';
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
    public actualDb: MerkleTreeAdminOperations,
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
    worldState: 'native' | 'legacy' = 'legacy',
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

    let actualDb: MerkleTreeAdminOperations;

    if (worldState === 'native') {
      const dir = await fs.mkdtemp(join(tmpdir(), 'prover-client-world-state-'));
      directoriesToCleanup.push(dir);
      const ws = await NativeWorldStateService.create(dir);
      actualDb = ws.asLatest();
    } else {
      const ws = await MerkleTrees.new(openTmpStore(), telemetry);
      actualDb = ws.asLatest();
    }

    const processor = PublicProcessor.create(
      actualDb,
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
      };
      localProver = await createProver(bbConfig);
    }

    if (config?.directoryToCleanup) {
      directoriesToCleanup.push(config.directoryToCleanup);
    }

    const queue = new MemoryProvingQueue(telemetry);
    const orchestrator = new ProvingOrchestrator(actualDb, queue, telemetry);
    const agent = new ProverAgent(localProver, proverCount);

    queue.start();
    agent.start(queue);

    return new this(
      publicExecutor,
      worldStateDB,
      processor,
      simulationProvider,
      globalVariables,
      actualDb,
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
      execution: PublicExecutionRequest,
      _constants: CombinedConstantData,
      availableGas: Gas,
      _txContext: TxContext,
      _pendingNullifiers: Nullifier[],
      transactionFee?: Fr,
      _sideEffectCounter?: number,
    ) => {
      for (const tx of txs) {
        const allCalls = tx.publicTeardownFunctionCall.isEmpty()
          ? tx.enqueuedPublicFunctionCalls
          : [...tx.enqueuedPublicFunctionCalls, tx.publicTeardownFunctionCall];
        for (const request of allCalls) {
          if (execution.contractAddress.equals(request.contractAddress)) {
            const result = PublicExecutionResultBuilder.fromPublicExecutionRequest({ request }).build({
              startGasLeft: availableGas,
              endGasLeft: availableGas,
              transactionFee,
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
      execution: PublicExecutionRequest,
      constants: CombinedConstantData,
      availableGas: Gas,
      txContext: TxContext,
      pendingNullifiers: Nullifier[],
      transactionFee?: Fr,
      sideEffectCounter?: number,
    ) => Promise<PublicExecutionResult>,
  ) {
    if (executorMock) {
      this.publicExecutor.simulate.mockImplementation(executorMock);
    }
    return await this.publicProcessor.process(txs, maxTransactions, txHandler, txValidator);
  }
}
