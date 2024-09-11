import { type BBProverConfig } from '@aztec/bb-prover';
import {
  type BlockProver,
  type MerkleTreeAdminOperations,
  MerkleTreeId,
  type ProcessedTx,
  type PublicExecutionRequest,
  type ServerCircuitProver,
  type TreeInfo,
  type Tx,
  type TxValidator,
  merkleTreeIds,
} from '@aztec/circuit-types';
import { type Gas, GlobalVariables, Header, type Nullifier, type TxContext } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { type DebugLogger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/utils';
import {
  type ContractsDataSourcePublicDB,
  type PublicExecutionResult,
  PublicExecutionResultBuilder,
  type PublicExecutor,
  PublicProcessor,
  RealPublicKernelCircuitSimulator,
  type SimulationProvider,
  WASMSimulator,
  type WorldStatePublicDB,
} from '@aztec/simulator';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { MerkleTrees } from '@aztec/world-state';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { expect } from '@jest/globals';
import * as fs from 'fs/promises';
import { type MockProxy, mock } from 'jest-mock-extended';
import { tmpdir } from 'os';
import { join } from 'path';

import { TestCircuitProver } from '../../../../bb-prover/src/test/test_circuit_prover.js';
import { getEnvironmentConfig, getSimulationProvider, makeGlobals } from '../../mocks/fixtures.js';
import { MemoryProvingQueue } from '../../prover-agent/memory-proving-queue.js';
import { ProverAgent } from '../../prover-agent/prover-agent.js';
import { ProverAdapter } from '../adapters/prover.js';
import { SimulatorAdapter } from '../adapters/simulator.js';
import { BlockOrchestrator } from '../block-orchestrator.js';
import { EpochOrchestrator } from '../epoch-orchestrator.js';
import { type OrchestratorContext } from '../types.js';

// Adapted from mocks/test_context
export class TestContext {
  constructor(
    public publicExecutor: MockProxy<PublicExecutor>,
    public publicContractsDB: MockProxy<ContractsDataSourcePublicDB>,
    public publicWorldStateDB: MockProxy<WorldStatePublicDB>,
    public publicProcessor: PublicProcessor,
    public simulationProvider: SimulationProvider,
    public actualDb: MerkleTreeAdminOperations,
    public expectsDb: MerkleTreeAdminOperations,
    public prover: ServerCircuitProver,
    public proverAgent: ProverAgent,
    public epochNumber: number,
    public orchestratorContext: OrchestratorContext,
    public directoriesToCleanup: string[],
    public logger: DebugLogger,
  ) {}

  static async new(
    logger: DebugLogger,
    worldState: 'native' | 'legacy' = 'legacy',
    proverCount = 4,
    createProver: (bbConfig: BBProverConfig) => Promise<ServerCircuitProver> = _ =>
      Promise.resolve(new TestCircuitProver(new NoopTelemetryClient(), new WASMSimulator())),
    epochNumber = 3,
  ) {
    const directoriesToCleanup: string[] = [];

    const publicExecutor = mock<PublicExecutor>();
    const publicContractsDB = mock<ContractsDataSourcePublicDB>();
    const publicWorldStateDB = mock<WorldStatePublicDB>();
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

    const expectsDb = await MerkleTrees.new(openTmpStore(), new NoopTelemetryClient()).then(t => t.asLatest());

    const processor = new PublicProcessor(
      actualDb,
      publicExecutor,
      publicKernel,
      GlobalVariables.empty(),
      Header.empty(),
      publicContractsDB,
      publicWorldStateDB,
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
    const agent = new ProverAgent(localProver, proverCount);

    queue.start();
    agent.start(queue);

    const context: OrchestratorContext = {
      db: actualDb,
      simulator: new SimulatorAdapter(
        epochNumber,
        new TestCircuitProver(new NoopTelemetryClient(), new WASMSimulator()),
        undefined,
      ),
      prover: new ProverAdapter(epochNumber, queue, undefined),
      proverId: Fr.fromString('0x1234'),
      telemetryClient: new NoopTelemetryClient(),
      options: {
        checkSimulationMatchesProof: true,
        avmProvingStrict: false,
        simulationOnly: false,
      },
    };

    return new this(
      publicExecutor,
      publicContractsDB,
      publicWorldStateDB,
      processor,
      simulationProvider,
      actualDb,
      expectsDb,
      localProver,
      agent,
      epochNumber,
      context,
      directoriesToCleanup,
      logger,
    );
  }

  buildGlobals(blockNumber: number) {
    return makeGlobals(blockNumber);
  }

  buildBlockOrchestrator(args: {
    numTxs: number;
    l1ToL2Messages?: Fr[];
    blockNumber?: number;
    simulationOnly?: boolean;
  }) {
    const globals = this.buildGlobals(args.blockNumber ?? 10);
    this.orchestratorContext.options.simulationOnly = args.simulationOnly ?? false;
    return new BlockOrchestrator(0, args.numTxs, globals, args.l1ToL2Messages ?? [], this.orchestratorContext);
  }

  buildEpochOrchestrator(numBlocks: number) {
    return new EpochOrchestrator(numBlocks, this.orchestratorContext);
  }

  async assertDbsMatch() {
    const inspect = (tree: TreeInfo) => `size=${tree.size} root=${tree.root.toString('hex')} id=${tree.treeId}`;
    for (const treeId of merkleTreeIds()) {
      // It's not trivial to compute the block hash just from a batch of txs, so we skip this check
      if (treeId === MerkleTreeId.ARCHIVE) {
        continue;
      }
      const actualTree = await this.actualDb.getTreeInfo(treeId);
      const expectedTree = await this.expectsDb.getTreeInfo(treeId);
      expect(inspect(actualTree)).toEqual(inspect(expectedTree));
    }
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
    blockProver?: BlockProver,
    txValidator?: TxValidator<ProcessedTx>,
  ) {
    const defaultExecutorImplementation = (
      execution: PublicExecutionRequest,
      _globalVariables: GlobalVariables,
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
      blockProver,
      txValidator,
      defaultExecutorImplementation,
    );
  }

  public async processPublicFunctionsWithMockExecutorImplementation(
    txs: Tx[],
    maxTransactions: number,
    blockProver?: BlockProver,
    txValidator?: TxValidator<ProcessedTx>,
    executorMock?: (
      execution: PublicExecutionRequest,
      globalVariables: GlobalVariables,
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
    return await this.publicProcessor.process(txs, maxTransactions, blockProver, txValidator);
  }
}
