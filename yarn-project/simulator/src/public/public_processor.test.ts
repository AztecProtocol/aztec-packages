import {
  type MerkleTreeWriteOperations,
  type ProcessedTx,
  ProvingRequestType,
  SimulationError,
  type TreeInfo,
  type TxValidator,
  mockTx,
} from '@aztec/circuit-types';
import {
  AvmCircuitInputs,
  AztecAddress,
  BlockHeader,
  Fr,
  Gas,
  GasFees,
  GlobalVariables,
  PublicDataWrite,
  RevertCode,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot } from '@aztec/circuits.js/hash';
import { times } from '@aztec/foundation/collection';
import { sleep } from '@aztec/foundation/sleep';
import { TestDateProvider } from '@aztec/foundation/timer';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { type MockProxy, mock } from 'jest-mock-extended';

import { computeFeePayerBalanceLeafSlot } from './fee_payment.js';
import { type WorldStateDB } from './public_db_sources.js';
import { PublicProcessor } from './public_processor.js';
import { type PublicTxResult, type PublicTxSimulator } from './public_tx_simulator.js';

describe('public_processor', () => {
  let db: MockProxy<MerkleTreeWriteOperations>;
  let worldStateDB: MockProxy<WorldStateDB>;
  let publicTxSimulator: MockProxy<PublicTxSimulator>;

  let root: Buffer;
  let mockedEnqueuedCallsResult: PublicTxResult;

  let processor: PublicProcessor;

  const gasFees = GasFees.from({ feePerDaGas: new Fr(2), feePerL2Gas: new Fr(3) });
  const globalVariables = GlobalVariables.from({ ...GlobalVariables.empty(), gasFees });

  const mockPrivateOnlyTx = ({ seed = 1, feePayer }: { seed?: number; feePayer?: AztecAddress } = {}) =>
    mockTx(seed, { numberOfNonRevertiblePublicCallRequests: 0, numberOfRevertiblePublicCallRequests: 0, feePayer });

  const mockTxWithPublicCalls = ({ seed = 1, feePayer }: { seed?: number; feePayer?: AztecAddress } = {}) =>
    mockTx(seed, { numberOfNonRevertiblePublicCallRequests: 1, numberOfRevertiblePublicCallRequests: 1, feePayer });

  beforeEach(() => {
    db = mock<MerkleTreeWriteOperations>();
    worldStateDB = mock<WorldStateDB>();
    publicTxSimulator = mock();

    root = Buffer.alloc(32, 5);

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
      },
      revertCode: RevertCode.OK,
      processedPhases: [],
    };

    db.getTreeInfo.mockResolvedValue({ root } as TreeInfo);

    worldStateDB.storageRead.mockResolvedValue(Fr.ZERO);

    publicTxSimulator.simulate.mockImplementation(() => {
      return Promise.resolve(mockedEnqueuedCallsResult);
    });

    processor = new PublicProcessor(
      db,
      globalVariables,
      BlockHeader.empty(),
      worldStateDB,
      publicTxSimulator,
      new TestDateProvider(),
      new NoopTelemetryClient(),
    );
  });

  describe('process txs', () => {
    it('process private-only txs', async function () {
      const tx = mockPrivateOnlyTx();

      const [processed, failed] = await processor.process([tx], 1);

      expect(processed.length).toBe(1);
      expect(processed[0].hash).toEqual(tx.getTxHash());
      expect(processed[0].data).toEqual(tx.data);
      expect(failed).toEqual([]);
    });

    it('runs a tx with enqueued public calls', async function () {
      const tx = mockTxWithPublicCalls();

      const [processed, failed] = await processor.process([tx], 1);

      expect(processed.length).toBe(1);
      expect(processed[0].hash).toEqual(tx.getTxHash());
      expect(processed[0].data).toEqual(tx.data);
      expect(failed).toEqual([]);

      expect(worldStateDB.commit).toHaveBeenCalledTimes(1);
    });

    it('runs a tx with reverted enqueued public calls', async function () {
      const tx = mockTxWithPublicCalls();

      mockedEnqueuedCallsResult.revertCode = RevertCode.APP_LOGIC_REVERTED;
      mockedEnqueuedCallsResult.revertReason = new SimulationError(`Failed`, []);

      const [processed, failed] = await processor.process([tx], 1);

      expect(processed.length).toBe(1);
      expect(processed[0].hash).toEqual(tx.getTxHash());
      expect(failed).toEqual([]);

      expect(worldStateDB.commit).toHaveBeenCalledTimes(1);
    });

    it('returns failed txs without aborting entire operation', async function () {
      publicTxSimulator.simulate.mockRejectedValue(new SimulationError(`Failed`, []));

      const tx = mockTxWithPublicCalls();
      const [processed, failed] = await processor.process([tx], 1);

      expect(processed).toEqual([]);
      expect(failed.length).toBe(1);
      expect(failed[0].tx).toEqual(tx);
      expect(failed[0].error).toEqual(new SimulationError(`Failed`, []));

      expect(worldStateDB.commit).toHaveBeenCalledTimes(0);
    });

    it('does not attempt to overfill a block', async function () {
      const txs = Array.from([1, 2, 3], seed => mockPrivateOnlyTx({ seed }));

      // We are passing 3 txs but only 2 can fit in the block
      const [processed, failed] = await processor.process(txs, 2);

      expect(processed.length).toBe(2);
      expect(processed[0].hash).toEqual(txs[0].getTxHash());
      expect(processed[1].hash).toEqual(txs[1].getTxHash());
      expect(failed).toEqual([]);

      expect(worldStateDB.commit).toHaveBeenCalledTimes(2);
    });

    it('does not send a transaction to the prover if validation fails', async function () {
      const tx = mockPrivateOnlyTx();

      const txValidator: MockProxy<TxValidator<ProcessedTx>> = mock();
      txValidator.validateTxs.mockRejectedValue([[], [tx]]);

      const [processed, failed] = await processor.process([tx], 1, txValidator);

      expect(processed).toEqual([]);
      expect(failed.length).toBe(1);
      expect(failed[0].tx).toEqual(tx);
    });

    it('does not go past the deadline', async function () {
      const txs = times(3, seed => mockTxWithPublicCalls({ seed }));

      // The simulator will take 400ms to process each tx
      publicTxSimulator.simulate.mockImplementation(async () => {
        await sleep(400);
        return mockedEnqueuedCallsResult;
      });

      // We allocate a deadline of 1s, so only one 2 txs should fit
      const deadline = new Date(Date.now() + 1000);
      const [processed, failed] = await processor.process(txs, 3, undefined, deadline);

      expect(processed.length).toBe(2);
      expect(processed[0].hash).toEqual(txs[0].getTxHash());
      expect(processed[1].hash).toEqual(txs[1].getTxHash());
      expect(failed).toEqual([]);
      expect(worldStateDB.commit).toHaveBeenCalledTimes(2);
    });
  });

  describe('with fee payer', () => {
    const feePayer = AztecAddress.fromBigInt(123123n);
    const initialBalance = new Fr(1000);

    beforeEach(() => {
      worldStateDB.storageRead.mockResolvedValue(initialBalance);

      worldStateDB.storageWrite.mockImplementation((address: AztecAddress, slot: Fr) =>
        Promise.resolve(computePublicDataTreeLeafSlot(address, slot).toBigInt()),
      );
    });

    it('injects balance update with no public calls', async function () {
      const tx = mockPrivateOnlyTx({
        feePayer,
      });

      const privateGasUsed = new Gas(12, 34);
      tx.data.gasUsed = privateGasUsed;

      const txFee = privateGasUsed.computeFee(globalVariables.gasFees);

      const [processed, failed] = await processor.process([tx], 1);

      expect(processed).toHaveLength(1);
      expect(processed[0].data.feePayer).toEqual(feePayer);
      expect(processed[0].txEffect.publicDataWrites[0]).toEqual(
        new PublicDataWrite(computeFeePayerBalanceLeafSlot(feePayer), initialBalance.sub(txFee)),
      );
      expect(failed).toEqual([]);

      expect(worldStateDB.commit).toHaveBeenCalledTimes(1);
      expect(worldStateDB.storageWrite).toHaveBeenCalledTimes(1);
    });

    it('rejects tx if fee payer has not enough balance', async function () {
      const tx = mockPrivateOnlyTx({
        feePayer,
      });

      const privateGasUsed = new Gas(initialBalance.toNumber(), initialBalance.toNumber());
      if (privateGasUsed.computeFee(gasFees) < initialBalance) {
        throw new Error('Test setup error: gas fees are too low');
      }
      tx.data.gasUsed = privateGasUsed;

      const [processed, failed] = await processor.process([tx], 1);

      expect(processed).toEqual([]);
      expect(failed).toHaveLength(1);
      expect(failed[0].error.message).toMatch(/Not enough balance/i);

      expect(worldStateDB.commit).toHaveBeenCalledTimes(0);
      expect(worldStateDB.storageWrite).toHaveBeenCalledTimes(0);
    });
  });
});
