import { PROVING_STATUS, PublicKernelType, mockTx } from '@aztec/circuit-types';
import { GlobalVariables, Header } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/utils';
import {
  type ContractsDataSourcePublicDB,
  PublicExecutionResultBuilder,
  type PublicExecutor,
  type PublicKernelCircuitSimulator,
  PublicProcessor,
  RealPublicKernelCircuitSimulator,
  WASMSimulator,
  type WorldStatePublicDB,
} from '@aztec/simulator';
import { type MerkleTreeOperations, MerkleTrees, TreeInfo } from '@aztec/world-state';

import { type MockProxy, mock } from 'jest-mock-extended';
import { type MemDown, default as memdown } from 'memdown';

import { getConfig, getSimulationProvider, makeEmptyProcessedTestTx, makeGlobals } from '../mocks/fixtures.js';
import { TestCircuitProver } from '../prover/test_circuit_prover.js';
import { ProvingOrchestrator } from './orchestrator.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

const logger = createDebugLogger('aztec:orchestrator-test');

describe('prover/orchestrator', () => {
  let builder: ProvingOrchestrator;
  let db: MockProxy<MerkleTreeOperations>;
  let builderDb: MerkleTreeOperations;
  let publicExecutor: MockProxy<PublicExecutor>;
  let publicContractsDB: MockProxy<ContractsDataSourcePublicDB>;
  let publicWorldStateDB: MockProxy<WorldStatePublicDB>;
  let publicKernel: PublicKernelCircuitSimulator;
  let processor: PublicProcessor;

  let prover: TestCircuitProver;

  let blockNumber: number;

  let globalVariables: GlobalVariables;
  let root: Buffer;

  beforeEach(async () => {
    blockNumber = 3;
    globalVariables = makeGlobals(blockNumber);

    const acvmConfig = await getConfig(logger);
    const simulationProvider = await getSimulationProvider({
      acvmWorkingDirectory: acvmConfig?.acvmWorkingDirectory,
      acvmBinaryPath: acvmConfig?.expectedAcvmPath,
    });
    prover = new TestCircuitProver(simulationProvider);

    builderDb = await MerkleTrees.new(openTmpStore()).then(t => t.asLatest());
    builder = new ProvingOrchestrator(builderDb, prover, 1);
  }, 20_000);

  describe('blocks with public functions', () => {
    beforeEach(async () => {
      publicExecutor = mock<PublicExecutor>();
      db = mock<MerkleTreeOperations>();
      root = Buffer.alloc(32, 5);
      db.getTreeInfo.mockResolvedValue({ root } as TreeInfo);
      publicContractsDB = mock<ContractsDataSourcePublicDB>();
      publicWorldStateDB = mock<WorldStatePublicDB>();
      builder = await ProvingOrchestrator.new(builderDb, prover);
      publicKernel = new RealPublicKernelCircuitSimulator(new WASMSimulator());
      processor = new PublicProcessor(
        db,
        publicExecutor,
        publicKernel,
        GlobalVariables.empty(),
        Header.empty(),
        publicContractsDB,
        publicWorldStateDB,
      );
    });

    afterEach(async () => {
      await builder.stop();
    });

    it('builds a block with a transaction with public functions', async () => {
      const tx = mockTx(1000, { numberOfNonRevertiblePublicCallRequests: 0, numberOfRevertiblePublicCallRequests: 2 });
      tx.data.constants.historicalHeader = await builderDb.buildInitialHeader();

      publicExecutor.simulate.mockImplementation(execution => {
        for (const request of tx.enqueuedPublicFunctionCalls) {
          if (execution.contractAddress.equals(request.contractAddress)) {
            const result = PublicExecutionResultBuilder.fromPublicCallRequest({ request }).build();
            // result.unencryptedLogs = tx.unencryptedLogs.functionLogs[0];
            return Promise.resolve(result);
          }
        }
        throw new Error(`Unexpected execution request: ${execution}`);
      });

      const [processed, _] = await processor.process([tx], 1, undefined);
      for (const tx of processed) {
        for (const nullifier of tx.data.end.newNullifiers) {
          logger.info(`Nullifier ${nullifier.toString()}`);
        }
        for (const request of tx.publicKernelRequests) {
          logger.info(`Kernel Request ${PublicKernelType[request.type]}`);
        }
      }

      // This will need to be a 2 tx block
      const blockTicket = await builder.startNewBlock(
        2,
        globalVariables,
        [],
        await makeEmptyProcessedTestTx(builderDb),
      );

      for (const processedTx of processed) {
        await builder.addNewTx(processedTx);
      }

      //  we need to complete the block as we have not added a full set of txs
      await builder.setBlockCompleted();

      const result = await blockTicket.provingPromise;
      expect(result.status).toBe(PROVING_STATUS.SUCCESS);
      const finalisedBlock = await builder.finaliseBlock();

      expect(finalisedBlock.block.number).toEqual(blockNumber);
    }, 60_000);
  });
});
