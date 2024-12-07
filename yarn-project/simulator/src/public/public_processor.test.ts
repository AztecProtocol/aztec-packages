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
  type AvmCircuitPublicInputs,
  AztecAddress,
  BlockHeader,
  Fr,
  Gas,
  GasFees,
  GlobalVariables,
  PublicDataWrite,
  RevertCode,
  countAccumulatedItems,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot } from '@aztec/circuits.js/hash';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { type MockProxy, mock } from 'jest-mock-extended';

import { computeFeePayerBalanceLeafSlot } from './fee_payment.js';
import { type WorldStateDB } from './public_db_sources.js';
import { PublicProcessor } from './public_processor.js';
import { type PublicTxResult, type PublicTxSimulator } from './public_tx_simulator.js';

describe('public_processor', () => {
  let db: MockProxy<MerkleTreeWriteOperations>;
  let worldStateDB: MockProxy<WorldStateDB>;
  let publicTxProcessor: MockProxy<PublicTxSimulator>;

  let root: Buffer;
  let mockedEnqueuedCallsResult: PublicTxResult;
  let mockedAvmOutput: AvmCircuitPublicInputs;

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
    publicTxProcessor = mock();

    root = Buffer.alloc(32, 5);

    const avmCircuitInputs = AvmCircuitInputs.empty();
    mockedAvmOutput = avmCircuitInputs.output;
    mockedEnqueuedCallsResult = {
      avmProvingRequest: {
        type: ProvingRequestType.PUBLIC_VM,
        inputs: avmCircuitInputs,
      },
      gasUsed: {
        totalGas: Gas.empty(),
        teardownGas: Gas.empty(),
      },
      revertCode: RevertCode.OK,
      processedPhases: [],
    };

    db.getTreeInfo.mockResolvedValue({ root } as TreeInfo);

    worldStateDB.storageRead.mockResolvedValue(Fr.ZERO);

    publicTxProcessor.simulate.mockImplementation(() => {
      return Promise.resolve(mockedEnqueuedCallsResult);
    });

    processor = new PublicProcessor(
      db,
      globalVariables,
      BlockHeader.empty(),
      worldStateDB,
      publicTxProcessor,
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
      publicTxProcessor.simulate.mockRejectedValue(new SimulationError(`Failed`, []));

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

    it('injects balance update with public enqueued call', async function () {
      const txFee = new Fr(567);
      mockedAvmOutput.transactionFee = txFee;

      const tx = mockTxWithPublicCalls({
        feePayer,
      });

      const [processed, failed] = await processor.process([tx], 1);

      expect(processed).toHaveLength(1);
      expect(processed[0].hash).toEqual(tx.getTxHash());
      expect(processed[0].data.feePayer).toEqual(feePayer);
      expect(processed[0].txEffect.transactionFee).toEqual(txFee);
      expect(processed[0].txEffect.publicDataWrites[0]).toEqual(
        new PublicDataWrite(computeFeePayerBalanceLeafSlot(feePayer), initialBalance.sub(txFee)),
      );
      expect(failed).toEqual([]);

      expect(worldStateDB.commit).toHaveBeenCalledTimes(1);
      expect(worldStateDB.storageWrite).toHaveBeenCalledTimes(1);
    });

    it('tweaks existing balance update from claim', async function () {
      const txFee = new Fr(567);
      const pendingBalance = new Fr(2000);
      const pendingWrites = [
        new PublicDataWrite(new Fr(888n), new Fr(999)),
        new PublicDataWrite(computeFeePayerBalanceLeafSlot(feePayer), pendingBalance),
        new PublicDataWrite(new Fr(666n), new Fr(777)),
      ];
      mockedAvmOutput.transactionFee = txFee;
      mockedAvmOutput.accumulatedData.publicDataWrites[0] = pendingWrites[0];
      mockedAvmOutput.accumulatedData.publicDataWrites[1] = pendingWrites[1];
      mockedAvmOutput.accumulatedData.publicDataWrites[2] = pendingWrites[2];

      const tx = mockTxWithPublicCalls({
        feePayer,
      });

      const [processed, failed] = await processor.process([tx], 1);

      expect(processed).toHaveLength(1);
      expect(processed[0].hash).toEqual(tx.getTxHash());
      expect(processed[0].data.feePayer).toEqual(feePayer);
      expect(countAccumulatedItems(processed[0].txEffect.publicDataWrites)).toBe(3);
      expect(processed[0].txEffect.publicDataWrites.slice(0, 3)).toEqual([
        pendingWrites[0],
        new PublicDataWrite(computeFeePayerBalanceLeafSlot(feePayer), pendingBalance.sub(txFee)),
        pendingWrites[2],
      ]);
      expect(failed).toEqual([]);

      expect(worldStateDB.commit).toHaveBeenCalledTimes(1);
      expect(worldStateDB.storageWrite).toHaveBeenCalledTimes(1);
    });

    it('rejects tx if fee payer has not enough balance', async function () {
      const txFee = initialBalance.add(new Fr(1));
      mockedAvmOutput.transactionFee = txFee;

      const tx = mockTxWithPublicCalls({
        feePayer,
      });

      const [processed, failed] = await processor.process([tx], 1);

      expect(processed).toEqual([]);
      expect(failed).toHaveLength(1);
      expect(failed[0].error.message).toMatch(/Not enough balance/i);

      expect(worldStateDB.commit).toHaveBeenCalledTimes(0);
      expect(worldStateDB.storageWrite).toHaveBeenCalledTimes(0);
    });
  });
});
