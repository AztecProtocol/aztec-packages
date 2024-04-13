import { PROVING_STATUS, type PublicKernelRequest, PublicKernelType } from '@aztec/circuit-types';
import { type GlobalVariables } from '@aztec/circuits.js';
import {
  makePublicKernelCircuitPrivateInputs,
  makePublicKernelTailCircuitPrivateInputs,
} from '@aztec/circuits.js/testing';
import { createDebugLogger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/utils';
import { type MerkleTreeOperations, MerkleTrees } from '@aztec/world-state';

import { type MemDown, default as memdown } from 'memdown';

import {
  getConfig,
  getSimulationProvider,
  makeBloatedProcessedTx,
  makeEmptyProcessedTestTx,
  makeGlobals,
} from '../mocks/fixtures.js';
import { TestCircuitProver } from '../prover/test_circuit_prover.js';
import { ProvingOrchestrator } from './orchestrator.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

const logger = createDebugLogger('aztec:orchestrator-test');

describe('prover/orchestrator', () => {
  let builder: ProvingOrchestrator;
  let builderDb: MerkleTreeOperations;

  let prover: TestCircuitProver;

  let blockNumber: number;

  let globalVariables: GlobalVariables;

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
      builder = await ProvingOrchestrator.new(builderDb, prover);
    });

    afterEach(async () => {
      await builder.stop();
    });

    it('builds a block with a transaction with public functions', async () => {
      const tx = await makeBloatedProcessedTx(builderDb, 1);
      const setup: PublicKernelRequest = {
        type: PublicKernelType.SETUP,
        inputs: makePublicKernelCircuitPrivateInputs(2),
      };

      const app: PublicKernelRequest = {
        type: PublicKernelType.APP_LOGIC,
        inputs: makePublicKernelCircuitPrivateInputs(3),
      };

      const teardown: PublicKernelRequest = {
        type: PublicKernelType.TEARDOWN,
        inputs: makePublicKernelCircuitPrivateInputs(4),
      };

      const tail: PublicKernelRequest = {
        type: PublicKernelType.TAIL,
        inputs: makePublicKernelTailCircuitPrivateInputs(5),
      };

      tx.publicKernelRequests = [setup, app, teardown, tail];

      // This will need to be a 2 tx block
      const blockTicket = await builder.startNewBlock(
        2,
        globalVariables,
        [],
        await makeEmptyProcessedTestTx(builderDb),
      );

      await builder.addNewTx(tx);

      //  we need to complete the block as we have not added a full set of txs
      await builder.setBlockCompleted();

      const result = await blockTicket.provingPromise;
      expect(result.status).toBe(PROVING_STATUS.SUCCESS);
      const finalisedBlock = await builder.finaliseBlock();

      expect(finalisedBlock.block.number).toEqual(blockNumber);
    }, 60_000);
  });
});
