import { PROVING_STATUS, mockTx } from '@aztec/circuit-types';
import { type GlobalVariables } from '@aztec/circuits.js';
import { times } from '@aztec/foundation/collection';
import { createDebugLogger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/utils';
import { type MerkleTreeOperations, MerkleTrees, type TreeInfo } from '@aztec/world-state';

import { type MemDown, default as memdown } from 'memdown';

import { getConfig, getSimulationProvider, makeEmptyProcessedTestTx, makeGlobals } from '../mocks/fixtures.js';
import { TestPublicProcessor } from '../mocks/test_public_processor.js';
import { TestCircuitProver } from '../prover/test_circuit_prover.js';
import { ProvingOrchestrator } from './orchestrator.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

const logger = createDebugLogger('aztec:orchestrator-test');

describe('prover/orchestrator', () => {
  let builderDb: MerkleTreeOperations;
  let orchestrator: ProvingOrchestrator;
  let processor: TestPublicProcessor;

  let prover: TestCircuitProver;

  let blockNumber: number;
  let testCount = 1;

  let globalVariables: GlobalVariables;
  let root: Buffer;

  describe('blocks with public functions', () => {
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
      orchestrator = await ProvingOrchestrator.new(builderDb, prover);

      processor = TestPublicProcessor.new();
      root = Buffer.alloc(32, 5);
      processor.db.getTreeInfo.mockResolvedValue({ root } as TreeInfo);
    });

    afterEach(async () => {
      await orchestrator.stop();
    });

    it.each([[4, 2, 3]] as const)(
      'builds an L2 block with %i transactions each with %i revertible and %i non revertible',
      async (
        numTransactions: number,
        numberOfNonRevertiblePublicCallRequests: number,
        numberOfRevertiblePublicCallRequests: number,
      ) => {
        const txs = times(numTransactions, (i: number) =>
          mockTx(100000 * testCount++ + 1000 * i, {
            numberOfNonRevertiblePublicCallRequests,
            numberOfRevertiblePublicCallRequests,
          }),
        );
        for (const tx of txs) {
          tx.data.constants.historicalHeader = await builderDb.buildInitialHeader();
        }

        // This will need to be a 2 tx block
        const blockTicket = await orchestrator.startNewBlock(
          2,
          globalVariables,
          [],
          await makeEmptyProcessedTestTx(builderDb),
        );

        await processor.process(txs, 2, orchestrator);

        //  we need to complete the block as we have not added a full set of txs
        await orchestrator.setBlockCompleted();

        const result = await blockTicket.provingPromise;
        expect(result.status).toBe(PROVING_STATUS.SUCCESS);
        const finalisedBlock = await orchestrator.finaliseBlock();

        expect(finalisedBlock.block.number).toEqual(blockNumber);
      },
      60_000,
    );
  });
});
