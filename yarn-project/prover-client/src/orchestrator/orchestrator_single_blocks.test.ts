import { PROVING_STATUS, type ProcessedTx, type PublicKernelRequest, PublicKernelType } from '@aztec/circuit-types';
import { AztecAddress, EthAddress, Fr, GlobalVariables, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/circuits.js';
import { fr, makePublicKernelCircuitPrivateInputs } from '@aztec/circuits.js/testing';
import { range } from '@aztec/foundation/array';
import { createDebugLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { openTmpStore } from '@aztec/kv-store/utils';
import { type MerkleTreeOperations, MerkleTrees } from '@aztec/world-state';

import { type MemDown, default as memdown } from 'memdown';

import {
  getConfig,
  getSimulationProvider,
  makeBloatedProcessedTx,
  makeEmptyProcessedTx,
  updateExpectedTreesFromTxs,
} from '../mocks/fixtures.js';
import { TestCircuitProver } from '../prover/test_circuit_prover.js';
import { ProvingOrchestrator } from './orchestrator.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

const logger = createDebugLogger('aztec:orchestrator-test');

describe('prover/orchestrator', () => {
  let builder: ProvingOrchestrator;
  let builderDb: MerkleTreeOperations;
  let expectsDb: MerkleTreeOperations;

  let prover: TestCircuitProver;

  let blockNumber: number;

  let globalVariables: GlobalVariables;

  const chainId = Fr.ZERO;
  const version = Fr.ZERO;
  const coinbase = EthAddress.ZERO;
  const feeRecipient = AztecAddress.ZERO;

  const makeGlobals = (blockNumber: number) => {
    return new GlobalVariables(chainId, version, new Fr(blockNumber), Fr.ZERO, coinbase, feeRecipient);
  };

  const makeEmptyProcessedTestTx = (): Promise<ProcessedTx> => {
    return makeEmptyProcessedTx(builderDb, chainId, version);
  };

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
    expectsDb = await MerkleTrees.new(openTmpStore()).then(t => t.asLatest());
    builder = new ProvingOrchestrator(builderDb, prover, 1);
  }, 20_000);

  describe('blocks', () => {
    beforeEach(async () => {
      builder = await ProvingOrchestrator.new(builderDb, prover);
    });

    afterEach(async () => {
      await builder.stop();
    });

    it('builds an empty L2 block', async () => {
      const txs = await Promise.all([makeEmptyProcessedTestTx(), makeEmptyProcessedTestTx()]);

      const blockTicket = await builder.startNewBlock(
        txs.length,
        globalVariables,
        [],
        await makeEmptyProcessedTestTx(),
      );

      for (const tx of txs) {
        await builder.addNewTx(tx);
      }

      const result = await blockTicket.provingPromise;
      expect(result.status).toBe(PROVING_STATUS.SUCCESS);
      const finalisedBlock = await builder.finaliseBlock();

      expect(finalisedBlock.block.number).toEqual(blockNumber);
    }, 30_000);

    it('builds a block with 1 transaction', async () => {
      const txs = await Promise.all([makeBloatedProcessedTx(builderDb, 1)]);

      await updateExpectedTreesFromTxs(expectsDb, txs);

      // This will need to be a 2 tx block
      const blockTicket = await builder.startNewBlock(2, globalVariables, [], await makeEmptyProcessedTestTx());

      for (const tx of txs) {
        await builder.addNewTx(tx);
      }

      //  we need to complete the block as we have not added a full set of txs
      await builder.setBlockCompleted();

      const result = await blockTicket.provingPromise;
      expect(result.status).toBe(PROVING_STATUS.SUCCESS);
      const finalisedBlock = await builder.finaliseBlock();

      expect(finalisedBlock.block.number).toEqual(blockNumber);
    }, 30_000);

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
        inputs: makePublicKernelCircuitPrivateInputs(5),
      };

      tx.publicKernelRequests = [setup, app, teardown, tail];

      // This will need to be a 2 tx block
      const blockTicket = await builder.startNewBlock(2, globalVariables, [], await makeEmptyProcessedTestTx());

      await builder.addNewTx(tx);

      //  we need to complete the block as we have not added a full set of txs
      await builder.setBlockCompleted();

      const result = await blockTicket.provingPromise;
      expect(result.status).toBe(PROVING_STATUS.SUCCESS);
      const finalisedBlock = await builder.finaliseBlock();

      expect(finalisedBlock.block.number).toEqual(blockNumber);
    }, 30_000);

    it('builds a block concurrently with transaction simulation', async () => {
      const txs = await Promise.all([
        makeBloatedProcessedTx(builderDb, 1),
        makeBloatedProcessedTx(builderDb, 2),
        makeBloatedProcessedTx(builderDb, 3),
        makeBloatedProcessedTx(builderDb, 4),
      ]);

      const l1ToL2Messages = range(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, 1 + 0x400).map(fr);

      const blockTicket = await builder.startNewBlock(
        txs.length,
        globalVariables,
        l1ToL2Messages,
        await makeEmptyProcessedTestTx(),
      );

      for (const tx of txs) {
        await builder.addNewTx(tx);
        await sleep(1000);
      }

      const result = await blockTicket.provingPromise;
      expect(result.status).toBe(PROVING_STATUS.SUCCESS);
      const finalisedBlock = await builder.finaliseBlock();

      expect(finalisedBlock.block.number).toEqual(blockNumber);
    }, 30_000);
  });
});
