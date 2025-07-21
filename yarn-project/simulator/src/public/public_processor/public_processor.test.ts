import { timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { sleep } from '@aztec/foundation/sleep';
import { TestDateProvider } from '@aztec/foundation/timer';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import { AvmCircuitInputs, PublicDataWrite, RevertCode } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { SimulationError } from '@aztec/stdlib/errors';
import { Gas, GasFees } from '@aztec/stdlib/gas';
import { ProvingRequestType } from '@aztec/stdlib/proofs';
import { mockTx } from '@aztec/stdlib/testing';
import { type MerkleTreeWriteOperations, PublicDataTreeLeaf, PublicDataTreeLeafPreimage } from '@aztec/stdlib/trees';
import { GlobalVariables, Tx, type TxValidator } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { type MockProxy, mock } from 'jest-mock-extended';

import { PublicContractsDB } from '../public_db_sources.js';
import type { PublicTxResult, PublicTxSimulator } from '../public_tx_simulator/public_tx_simulator.js';
import { GuardedMerkleTreeOperations } from './guarded_merkle_tree.js';
import { PublicProcessor } from './public_processor.js';

describe('public_processor', () => {
  let merkleTree: MockProxy<MerkleTreeWriteOperations>;
  let contractsDB: MockProxy<PublicContractsDB>;
  let publicTxSimulator: MockProxy<PublicTxSimulator>;

  let mockedEnqueuedCallsResult: PublicTxResult;

  let processor: PublicProcessor;

  const gasFees = GasFees.from({ feePerDaGas: 2n, feePerL2Gas: 3n });
  const globalVariables = GlobalVariables.from({ ...GlobalVariables.empty(), gasFees });

  const mockPrivateOnlyTx = ({ seed = 1, feePayer }: { seed?: number; feePayer?: AztecAddress } = {}) =>
    mockTx(seed, { numberOfNonRevertiblePublicCallRequests: 0, numberOfRevertiblePublicCallRequests: 0, feePayer });

  const mockTxWithPublicCalls = ({ seed = 1, feePayer }: { seed?: number; feePayer?: AztecAddress } = {}) =>
    mockTx(seed, { numberOfNonRevertiblePublicCallRequests: 1, numberOfRevertiblePublicCallRequests: 1, feePayer });

  beforeEach(() => {
    merkleTree = mock<MerkleTreeWriteOperations>();
    contractsDB = mock<PublicContractsDB>();
    publicTxSimulator = mock();

    const avmCircuitInputs = AvmCircuitInputs.empty();
    mockedEnqueuedCallsResult = {
      avmProvingRequest: {
        type: ProvingRequestType.PUBLIC_VM,
        inputs: avmCircuitInputs,
      },
      gasUsed: {
        totalGas: Gas.empty(),
        teardownGas: Gas.empty(),
        publicGas: Gas.empty(),
        billedGas: Gas.empty(),
      },
      revertCode: RevertCode.OK,
      processedPhases: [],
    };

    merkleTree.getPreviousValueIndex.mockResolvedValue({
      index: 0n,
      alreadyPresent: true,
    });
    merkleTree.getLeafPreimage.mockResolvedValue(
      new PublicDataTreeLeafPreimage(new PublicDataTreeLeaf(Fr.ZERO, Fr.ZERO), /*nextKey=*/ Fr.ZERO, /*nextIndex=*/ 0n),
    );

    publicTxSimulator.simulate.mockImplementation(() => {
      return Promise.resolve(mockedEnqueuedCallsResult);
    });

    processor = new PublicProcessor(
      globalVariables,
      new GuardedMerkleTreeOperations(merkleTree),
      contractsDB,
      publicTxSimulator,
      new TestDateProvider(),
      getTelemetryClient(),
    );
  });

  describe('process txs', () => {
    it('process private-only txs', async function () {
      const tx = await mockPrivateOnlyTx();

      const [processed, failed] = await processor.process([tx]);

      expect(processed.length).toBe(1);
      expect(processed[0].hash).toEqual(await tx.getTxHash());
      expect(processed[0].data).toEqual(tx.data);
      expect(failed).toEqual([]);
    });

    it('runs a tx with enqueued public calls', async function () {
      const tx = await mockTxWithPublicCalls();

      const [processed, failed] = await processor.process([tx]);

      expect(processed.length).toBe(1);
      expect(processed[0].hash).toEqual(await tx.getTxHash());
      expect(processed[0].data).toEqual(tx.data);
      expect(failed).toEqual([]);

      expect(merkleTree.commitCheckpoint).toHaveBeenCalledTimes(1);
    });

    it('runs a tx with reverted enqueued public calls', async function () {
      const tx = await mockTxWithPublicCalls();

      mockedEnqueuedCallsResult.revertCode = RevertCode.APP_LOGIC_REVERTED;
      mockedEnqueuedCallsResult.revertReason = new SimulationError(`Failed`, []);

      const [processed, failed] = await processor.process([tx]);

      expect(processed.length).toBe(1);
      expect(processed[0].hash).toEqual(await tx.getTxHash());
      expect(failed).toEqual([]);

      expect(merkleTree.commitCheckpoint).toHaveBeenCalledTimes(1);
    });

    it('returns failed txs without aborting entire operation', async function () {
      publicTxSimulator.simulate.mockRejectedValue(new SimulationError(`Failed`, []));

      const tx = await mockTxWithPublicCalls();
      const [processed, failed] = await processor.process([tx]);

      expect(processed).toEqual([]);
      expect(failed.length).toBe(1);
      expect(failed[0].tx).toEqual(tx);
      expect(failed[0].error).toEqual(new SimulationError(`Failed`, []));

      expect(merkleTree.commitCheckpoint).toHaveBeenCalledTimes(0);
      expect(merkleTree.revertCheckpoint).toHaveBeenCalledTimes(1);
    });

    it('does not attempt to overfill a block', async function () {
      const txs = await Promise.all(Array.from([1, 2, 3], seed => mockPrivateOnlyTx({ seed })));

      // We are passing 3 txs but only 2 can fit in the block
      const [processed, failed] = await processor.process(txs, { maxTransactions: 2 });

      expect(processed.length).toBe(2);
      expect(processed[0].hash).toEqual(await txs[0].getTxHash());
      expect(processed[1].hash).toEqual(await txs[1].getTxHash());
      expect(failed).toEqual([]);
    });

    it('does not send a transaction to the prover if pre validation fails', async function () {
      const tx = await mockPrivateOnlyTx();

      const txValidator: MockProxy<TxValidator<Tx>> = mock();
      txValidator.validateTx.mockResolvedValue({ result: 'invalid', reason: ['Invalid'] });

      const [processed, failed] = await processor.process([tx], {}, { preprocessValidator: txValidator });

      expect(processed).toEqual([]);
      expect(failed.length).toBe(1);
    });

    // Flakey timing test that's totally dependent on system load/architecture etc.
    it.skip('does not go past the deadline', async function () {
      const txs = await timesParallel(3, seed => mockTxWithPublicCalls({ seed }));

      // The simulator will take 400ms to process each tx
      publicTxSimulator.simulate.mockImplementation(async () => {
        await sleep(800);
        return mockedEnqueuedCallsResult;
      });

      // We allocate a deadline of 2s, so only 2 txs should fit
      const deadline = new Date(Date.now() + 2000);
      const [processed, failed] = await processor.process(txs, { deadline });

      expect(processed.length).toBe(2);
      expect(processed[0].hash).toEqual(await txs[0].getTxHash());
      expect(processed[1].hash).toEqual(await txs[1].getTxHash());
      expect(failed).toEqual([]);
      expect(merkleTree.commitCheckpoint).toHaveBeenCalledTimes(2);
    });
  });

  describe('with fee payer', () => {
    const feePayer = AztecAddress.fromBigInt(123123n);
    const initialBalance = new Fr(1000);

    beforeEach(async () => {
      merkleTree.getLeafPreimage.mockResolvedValue(
        new PublicDataTreeLeafPreimage(
          new PublicDataTreeLeaf(await computeFeePayerBalanceLeafSlot(feePayer), initialBalance),
          /*nextKey=*/ Fr.ZERO,
          /*nextIndex=*/ 0n,
        ),
      );
    });

    it('injects balance update with no public calls', async function () {
      const tx = await mockPrivateOnlyTx({
        feePayer,
      });

      const privateGasUsed = new Gas(12, 34);
      tx.data.gasUsed = privateGasUsed;

      const txFee = privateGasUsed.computeFee(globalVariables.gasFees);

      const [processed, failed] = await processor.process([tx]);

      expect(processed).toHaveLength(1);
      expect(processed[0].data.feePayer).toEqual(feePayer);
      expect(processed[0].txEffect.publicDataWrites[0]).toEqual(
        new PublicDataWrite(await computeFeePayerBalanceLeafSlot(feePayer), initialBalance.sub(txFee)),
      );
      expect(failed).toEqual([]);

      expect(merkleTree.sequentialInsert).toHaveBeenCalledTimes(1);
    });

    it('rejects tx if fee payer has not enough balance', async function () {
      const tx = await mockPrivateOnlyTx({
        feePayer,
      });

      const privateGasUsed = new Gas(initialBalance.toNumber(), initialBalance.toNumber());
      if (privateGasUsed.computeFee(gasFees) < initialBalance) {
        throw new Error('Test setup error: gas fees are too low');
      }
      tx.data.gasUsed = privateGasUsed;

      const [processed, failed] = await processor.process([tx]);

      expect(processed).toEqual([]);
      expect(failed).toHaveLength(1);
      expect(failed[0].error.message).toMatch(/Not enough balance/i);

      expect(merkleTree.commitCheckpoint).toHaveBeenCalledTimes(0);
      expect(merkleTree.revertCheckpoint).toHaveBeenCalledTimes(1);
      expect(merkleTree.sequentialInsert).toHaveBeenCalledTimes(0);
    });
  });
});
