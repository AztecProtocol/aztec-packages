import { CONTRACT_CLASS_PUBLISHED_MAGIC_VALUE, CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS } from '@aztec/constants';
import { timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { TestDateProvider } from '@aztec/foundation/timer';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import { bufferAsFields } from '@aztec/stdlib/abi';
import { PublicDataWrite, PublicTxResult, RevertCode } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { Gas, GasFees } from '@aztec/stdlib/gas';
import { LogHash } from '@aztec/stdlib/kernel';
import { ContractClassLogFields } from '@aztec/stdlib/logs';
import { makeContractClassPublic, mockTx } from '@aztec/stdlib/testing';
import { type MerkleTreeWriteOperations, PublicDataTreeLeaf, PublicDataTreeLeafPreimage } from '@aztec/stdlib/trees';
import { GlobalVariables, StateReference, Tx, type TxValidator } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { strict as assert } from 'assert';
import { type MockProxy, mock } from 'jest-mock-extended';

import { PublicContractsDB } from '../public_db_sources.js';
import type { PublicTxSimulatorInterface } from '../public_tx_simulator/index.js';
import { GuardedMerkleTreeOperations } from './guarded_merkle_tree.js';
import { PublicProcessor } from './public_processor.js';

describe('public_processor', () => {
  let merkleTree: MockProxy<MerkleTreeWriteOperations>;
  let contractsDB: PublicContractsDB;
  let publicTxSimulator: MockProxy<Required<PublicTxSimulatorInterface>>;

  let mockedEnqueuedCallsResult: PublicTxResult;

  let processor: PublicProcessor;

  const gasFees = GasFees.from({ feePerDaGas: 2n, feePerL2Gas: 3n });
  const globalVariables = GlobalVariables.from({ ...GlobalVariables.empty(), gasFees });

  const mockPrivateOnlyTx = ({ seed = 1, feePayer }: { seed?: number; feePayer?: AztecAddress } = {}) =>
    mockTx(seed, { numberOfNonRevertiblePublicCallRequests: 0, numberOfRevertiblePublicCallRequests: 0, feePayer });

  const mockTxWithPublicCalls = ({ seed = 1, feePayer }: { seed?: number; feePayer?: AztecAddress } = {}) =>
    mockTx(seed, { numberOfNonRevertiblePublicCallRequests: 1, numberOfRevertiblePublicCallRequests: 1, feePayer });

  const mockContractClassForTx = async (tx: Tx, revertible = true) => {
    const publicContractClass = await makeContractClassPublic(42);
    const contractClassLogFields = [
      new Fr(CONTRACT_CLASS_PUBLISHED_MAGIC_VALUE),
      publicContractClass.id,
      new Fr(publicContractClass.version),
      publicContractClass.artifactHash,
      publicContractClass.privateFunctionsRoot,
      ...bufferAsFields(
        publicContractClass.packedBytecode,
        Math.ceil(publicContractClass.packedBytecode.length / 31) + 1,
      ),
    ];
    const contractAddress = new AztecAddress(new Fr(CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS));
    const emittedLength = contractClassLogFields.length;
    const logFields = ContractClassLogFields.fromEmittedFields(contractClassLogFields);

    tx.contractClassLogFields.push(logFields);

    const contractClassLogHash = LogHash.from({
      value: await logFields.hash(),
      length: emittedLength,
    }).scope(contractAddress);
    if (revertible) {
      tx.data.forPublic!.revertibleAccumulatedData.contractClassLogsHashes[0] = contractClassLogHash;
    } else {
      tx.data.forPublic!.nonRevertibleAccumulatedData.contractClassLogsHashes[0] = contractClassLogHash;
    }

    return publicContractClass.id;
  };

  beforeEach(() => {
    merkleTree = mock<MerkleTreeWriteOperations>();
    contractsDB = new PublicContractsDB(mock<ContractDataSource>());
    publicTxSimulator = mock<Required<PublicTxSimulatorInterface>>();

    const stateReference = StateReference.empty();
    mockedEnqueuedCallsResult = PublicTxResult.empty();

    merkleTree.getPreviousValueIndex.mockResolvedValue({
      index: 0n,
      alreadyPresent: true,
    });
    merkleTree.getLeafPreimage.mockResolvedValue(
      new PublicDataTreeLeafPreimage(new PublicDataTreeLeaf(Fr.ZERO, Fr.ZERO), /*nextKey=*/ Fr.ZERO, /*nextIndex=*/ 0n),
    );
    merkleTree.getStateReference.mockResolvedValue(stateReference);
    merkleTree.createCheckpoint.mockResolvedValue(1);

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
      createLogger('simulator:public-processor'),
    );
  });

  describe('process txs', () => {
    it('process private-only txs', async function () {
      const tx = await mockPrivateOnlyTx();

      const [processed, failed] = await processor.process([tx]);

      expect(processed.length).toBe(1);
      expect(processed[0].hash).toEqual(tx.getTxHash());
      expect(processed[0].data).toEqual(tx.data);
      expect(failed).toEqual([]);
    });

    it('runs a tx with enqueued public calls', async function () {
      const tx = await mockTxWithPublicCalls();

      const [processed, failed] = await processor.process([tx]);

      expect(processed.length).toBe(1);
      expect(processed[0].hash).toEqual(tx.getTxHash());
      expect(processed[0].data).toEqual(tx.data);
      expect(failed).toEqual([]);

      expect(merkleTree.commitCheckpoint).toHaveBeenCalledTimes(1);
    });

    it('runs a tx with reverted enqueued public calls', async function () {
      const tx = await mockTxWithPublicCalls();

      mockedEnqueuedCallsResult.revertCode = RevertCode.REVERTED;

      const [processed, failed] = await processor.process([tx]);

      expect(processed.length).toBe(1);
      expect(processed[0].hash).toEqual(tx.getTxHash());
      expect(failed).toEqual([]);

      expect(merkleTree.commitCheckpoint).toHaveBeenCalledTimes(1);
    });

    it('returns failed txs without aborting entire operation', async function () {
      publicTxSimulator.simulate.mockRejectedValue(new Error(`Failed`));

      const tx = await mockTxWithPublicCalls();
      const [processed, failed] = await processor.process([tx]);

      expect(processed).toEqual([]);
      expect(failed.length).toBe(1);
      expect(failed[0].tx).toEqual(tx);
      expect(failed[0].error).toEqual(new Error(`Failed`));

      expect(merkleTree.commitCheckpoint).toHaveBeenCalledTimes(0);
      expect(merkleTree.revertAllCheckpointsTo).toHaveBeenCalledWith(0);
    });

    it('if a tx errors with assertion failure, public processor returns failed tx with its assertion message', async function () {
      publicTxSimulator.simulate.mockImplementation(() => assert(false, 'Forced assertion failure') as never);

      const tx = await mockTxWithPublicCalls();
      const [processed, failed] = await processor.process([tx]);

      expect(processed).toEqual([]);
      expect(failed.length).toBe(1);
      expect(failed[0].tx).toEqual(tx);
      expect(failed[0].error.message).toMatch(/Forced assertion failure/);

      expect(merkleTree.commitCheckpoint).toHaveBeenCalledTimes(0);
      expect(merkleTree.revertAllCheckpointsTo).toHaveBeenCalledWith(0);
    });

    it('does not attempt to overfill a block', async function () {
      const txs = await Promise.all(Array.from([1, 2, 3], seed => mockPrivateOnlyTx({ seed })));

      // We are passing 3 txs but only 2 can fit in the block
      const [processed, failed] = await processor.process(txs, { maxTransactions: 2 });

      expect(processed.length).toBe(2);
      expect(processed[0].hash).toEqual(txs[0].getTxHash());
      expect(processed[1].hash).toEqual(txs[1].getTxHash());
      expect(failed).toEqual([]);
    });

    it('skips tx before processing if estimated blob fields would exceed limit', async function () {
      const tx = await mockTxWithPublicCalls();
      // Add note hashes to inflate the estimated blob fields size
      for (let i = 0; i < 10; i++) {
        tx.data.forPublic!.nonRevertibleAccumulatedData.noteHashes[i] = Fr.random();
      }
      // 3 overhead + 1 nullifier + 10 note hashes = 14 estimated fields
      // Set a limit that is too small for even one tx
      const [processed, failed] = await processor.process([tx], { maxBlobFields: 10, isBuildingProposal: true });

      expect(processed).toEqual([]);
      expect(failed).toEqual([]);
      // The simulator should not have been called since the tx was skipped pre-processing
      expect(publicTxSimulator.simulate).not.toHaveBeenCalled();
    });

    it('does not exceed max blob fields limit', async function () {
      // Create 3 private-only transactions
      const txs = await Promise.all(Array.from([1, 2, 3], seed => mockPrivateOnlyTx({ seed })));

      // First, let's process one transaction to see how many blob fields it actually has
      const [testProcessed] = await processor.process([txs[0]]);
      const actualBlobFields = testProcessed[0].txEffect.toBlobFields().length;

      // Set the limit to allow only 2 transactions
      // If each tx has `actualBlobFields` fields, we set limit to allow 2 but not 3
      const maxBlobFields = actualBlobFields * 2;

      // Process all 3 transactions with the blob field limit
      const [processed, failed] = await processor.process(txs, { maxBlobFields });

      // Should only process 2 transactions due to blob field limit
      expect(processed.length).toBe(2);
      expect(processed[0].hash).toEqual(txs[0].getTxHash());
      expect(processed[1].hash).toEqual(txs[1].getTxHash());
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

    it('aborts in-flight tx processing and cancels the simulator', async function () {
      const tx = await mockTxWithPublicCalls();
      const controller = new AbortController();

      let finishSimulation!: () => void;
      const simulationFinished = new Promise<void>(resolve => {
        finishSimulation = resolve;
      });

      publicTxSimulator.simulate.mockImplementation(async () => {
        controller.abort();
        await simulationFinished;
        return mockedEnqueuedCallsResult;
      });
      publicTxSimulator.cancel.mockImplementation(() => {
        finishSimulation();
        return Promise.resolve();
      });

      const [processed, failed] = await processor.process([tx], { signal: controller.signal });

      expect(processed).toEqual([]);
      expect(failed).toEqual([]);
      expect(publicTxSimulator.cancel).toHaveBeenCalled();
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
      expect(processed[0].hash).toEqual(txs[0].getTxHash());
      expect(processed[1].hash).toEqual(txs[1].getTxHash());
      expect(failed).toEqual([]);
      expect(merkleTree.commitCheckpoint).toHaveBeenCalledTimes(2);
    });
  });

  describe('with fee payer', () => {
    const feePayer = AztecAddress.fromBigIntUnsafe(123123n);
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
      expect(merkleTree.revertAllCheckpointsTo).toHaveBeenCalledWith(0);
      expect(merkleTree.sequentialInsert).toHaveBeenCalledTimes(0);
    });
  });

  describe('checkpoint depth', () => {
    it('calls revertAllCheckpointsTo with depth on tx failure', async function () {
      merkleTree.createCheckpoint.mockResolvedValue(2);
      publicTxSimulator.simulate.mockRejectedValue(new Error('Boom'));

      const tx = await mockTxWithPublicCalls();
      const [processed, failed] = await processor.process([tx]);

      expect(processed).toEqual([]);
      expect(failed).toHaveLength(1);
      expect(merkleTree.revertAllCheckpointsTo).toHaveBeenCalledWith(1);
      expect(merkleTree.commitCheckpoint).not.toHaveBeenCalled();
    });

    it('createCheckpoint is called for each tx', async function () {
      const txs = await timesParallel(3, () => mockPrivateOnlyTx());

      await processor.process(txs);

      expect(merkleTree.createCheckpoint).toHaveBeenCalledTimes(3);
    });

    it('commits checkpoint on successful tx', async function () {
      const tx = await mockTxWithPublicCalls();

      const [processed, failed] = await processor.process([tx]);

      expect(processed).toHaveLength(1);
      expect(failed).toEqual([]);
      expect(merkleTree.commitCheckpoint).toHaveBeenCalledTimes(1);
      expect(merkleTree.revertAllCheckpointsTo).not.toHaveBeenCalled();
    });
  });

  // on uncaught error, public processor clears the tx-level cache entirely
  it('clears the tx-level cache entirely on uncaught error (like SETUP failure)', async function () {
    const tx = await mockTxWithPublicCalls();

    // we want to confirm that even non-revertibles get cleared
    const contractClassId = await mockContractClassForTx(tx, /*revertible=*/ false);

    publicTxSimulator.simulate.mockImplementation((simulatedTx: Tx) => {
      contractsDB.addNewContracts(simulatedTx);
      throw new Error('Uncaught error');
    });

    const [processed, failed] = await processor.process([tx]);

    expect(processed).toEqual([]);
    expect(failed).toEqual([expect.objectContaining({ error: new Error(`Uncaught error`) })]);

    // Check whether the contract class is in the DB based on whether it was revertible
    const contractClass = await contractsDB.getContractClass(contractClassId);
    // On uncaught error, the public processor clears the tx-level cache entirely
    expect(contractClass).toBeUndefined();
  });
});
