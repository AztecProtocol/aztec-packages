import {
  type MerkleTreeWriteOperations,
  type ProcessedTx,
  SimulationError,
  type TreeInfo,
  type TxValidator,
  mockTx,
} from '@aztec/circuit-types';
import {
  AppendOnlyTreeSnapshot,
  AztecAddress,
  ClientIvcProof,
  Fr,
  GasFees,
  GasSettings,
  GlobalVariables,
  Header,
  PUBLIC_DATA_TREE_HEIGHT,
  PartialStateReference,
  PublicDataTreeLeafPreimage,
  PublicDataWrite,
  StateReference,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot } from '@aztec/circuits.js/hash';
import { openTmpStore } from '@aztec/kv-store/utils';
import { type AppendOnlyTree, Poseidon, StandardTree, newTree } from '@aztec/merkle-tree';
import { type PublicExecutor, WASMSimulator, computeFeePayerBalanceLeafSlot } from '@aztec/simulator';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { type MockProxy, mock } from 'jest-mock-extended';

import { PublicExecutionResultBuilder } from '../mocks/fixtures.js';
import { type WorldStateDB } from './public_db_sources.js';
import { RealPublicKernelCircuitSimulator } from './public_kernel.js';
import { type PublicKernelCircuitSimulator } from './public_kernel_circuit_simulator.js';
import { PublicProcessor } from './public_processor.js';

describe('public_processor', () => {
  let db: MockProxy<MerkleTreeWriteOperations>;
  let publicExecutor: MockProxy<PublicExecutor>;
  let worldStateDB: MockProxy<WorldStateDB>;

  let proof: ClientIvcProof;
  let root: Buffer;

  let processor: PublicProcessor;

  beforeEach(() => {
    db = mock<MerkleTreeWriteOperations>();
    publicExecutor = mock<PublicExecutor>();
    worldStateDB = mock<WorldStateDB>();

    proof = ClientIvcProof.empty();
    root = Buffer.alloc(32, 5);

    db.getTreeInfo.mockResolvedValue({ root } as TreeInfo);
    worldStateDB.storageRead.mockResolvedValue(Fr.ZERO);
  });

  describe('with mock circuits', () => {
    let publicKernel: MockProxy<PublicKernelCircuitSimulator>;

    beforeEach(() => {
      publicKernel = mock<PublicKernelCircuitSimulator>();
      processor = PublicProcessor.create(
        db,
        publicExecutor,
        publicKernel,
        GlobalVariables.empty(),
        Header.empty(),
        worldStateDB,
        new NoopTelemetryClient(),
      );
    });

    it('skips txs without public execution requests', async function () {
      const tx = mockTx(1, { numberOfNonRevertiblePublicCallRequests: 0, numberOfRevertiblePublicCallRequests: 0 });

      const hash = tx.getTxHash();
      const [processed, failed] = await processor.process([tx], 1);

      expect(processed.length).toBe(1);
      expect(processed[0]).toEqual(
        expect.objectContaining({
          hash,
          data: tx.data,
        }),
      );
      expect(failed).toEqual([]);
    });

    it('returns failed txs without aborting entire operation', async function () {
      publicExecutor.simulate.mockRejectedValue(new SimulationError(`Failed`, []));

      const tx = mockTx(1, { numberOfNonRevertiblePublicCallRequests: 0, numberOfRevertiblePublicCallRequests: 1 });
      const [processed, failed] = await processor.process([tx], 1);

      expect(processed).toEqual([]);
      expect(failed[0].tx).toEqual(tx);
      expect(failed[0].error).toEqual(new SimulationError(`Failed`, []));
      expect(worldStateDB.commit).toHaveBeenCalledTimes(0);
      expect(worldStateDB.rollbackToCommit).toHaveBeenCalledTimes(1);
    });
  });

  describe('with actual circuits', () => {
    let publicKernel: PublicKernelCircuitSimulator;
    let publicDataTree: AppendOnlyTree<Fr>;

    beforeAll(async () => {
      publicDataTree = await newTree(
        StandardTree,
        openTmpStore(),
        new Poseidon(),
        'PublicData',
        Fr,
        PUBLIC_DATA_TREE_HEIGHT,
        1, // Add a default low leaf for the public data hints to be proved against.
      );
    });

    beforeEach(() => {
      const snap = new AppendOnlyTreeSnapshot(
        Fr.fromBuffer(publicDataTree.getRoot(true)),
        Number(publicDataTree.getNumLeaves(true)),
      );

      const header = Header.empty();
      const stateReference = new StateReference(
        header.state.l1ToL2MessageTree,
        new PartialStateReference(header.state.partial.noteHashTree, header.state.partial.nullifierTree, snap),
      );
      // Clone the whole state because somewhere down the line (AbstractPhaseManager) the public data root is modified in the referenced header directly :/
      header.state = StateReference.fromBuffer(stateReference.toBuffer());

      db.getStateReference.mockResolvedValue(stateReference);
      db.getSiblingPath.mockResolvedValue(publicDataTree.getSiblingPath(0n, false));
      db.getPreviousValueIndex.mockResolvedValue({ index: 0n, alreadyPresent: true });
      db.getLeafPreimage.mockResolvedValue(new PublicDataTreeLeafPreimage(new Fr(0), new Fr(0), new Fr(0), 0n));

      publicExecutor.simulate.mockImplementation((_stateManager, _request) => {
        const result = PublicExecutionResultBuilder.empty().build();
        return Promise.resolve(result);
      });

      publicKernel = new RealPublicKernelCircuitSimulator(new WASMSimulator());
      processor = PublicProcessor.create(
        db,
        publicExecutor,
        publicKernel,
        GlobalVariables.from({ ...GlobalVariables.empty(), gasFees: GasFees.default() }),
        header,
        worldStateDB,
        new NoopTelemetryClient(),
      );
    });

    it('runs a tx with enqueued public calls', async function () {
      const tx = mockTx(1, {
        numberOfNonRevertiblePublicCallRequests: 0,
        numberOfRevertiblePublicCallRequests: 2,
        hasLogs: true,
      });

      const [processed, failed] = await processor.process([tx], 1);

      expect(failed.map(f => f.error)).toEqual([]);
      expect(processed).toHaveLength(1);
      expect(processed[0].hash).toEqual(tx.getTxHash());
      expect(processed[0].clientIvcProof).toEqual(proof);
      expect(publicExecutor.simulate).toHaveBeenCalledTimes(2);
      expect(worldStateDB.commit).toHaveBeenCalledTimes(1);
      expect(worldStateDB.rollbackToCommit).toHaveBeenCalledTimes(0);

      // we keep the logs
      expect(processed[0].txEffect.encryptedLogs.getTotalLogCount()).toBe(6);
      expect(processed[0].txEffect.unencryptedLogs.getTotalLogCount()).toBe(2);
    });

    it('does not attempt to overfill a block', async function () {
      const txs = Array.from([1, 2, 3], index =>
        mockTx(index, { numberOfNonRevertiblePublicCallRequests: 0, numberOfRevertiblePublicCallRequests: 1 }),
      );

      // We are passing 3 txs but only 2 can fit in the block
      const [processed, failed] = await processor.process(txs, 2);

      expect(processed).toHaveLength(2);
      expect(processed[0].hash).toEqual(txs[0].getTxHash());
      expect(processed[0].clientIvcProof).toEqual(proof);
      expect(processed[1].hash).toEqual(txs[1].getTxHash());
      expect(processed[1].clientIvcProof).toEqual(proof);
      expect(failed).toHaveLength(0);
      expect(publicExecutor.simulate).toHaveBeenCalledTimes(2);
      expect(worldStateDB.commit).toHaveBeenCalledTimes(2);
      expect(worldStateDB.rollbackToCommit).toHaveBeenCalledTimes(0);
    });

    it('does not send a transaction to the prover if validation fails', async function () {
      const tx = mockTx(1, { numberOfNonRevertiblePublicCallRequests: 0, numberOfRevertiblePublicCallRequests: 1 });

      const txValidator: MockProxy<TxValidator<ProcessedTx>> = mock();
      txValidator.validateTxs.mockRejectedValue([[], [tx]]);

      const [processed, failed] = await processor.process([tx], 1, txValidator);

      expect(processed).toHaveLength(0);
      expect(failed).toHaveLength(1);
      expect(publicExecutor.simulate).toHaveBeenCalledTimes(1);
    });

    describe('with fee payer', () => {
      it('injects balance update with no public calls', async function () {
        const feePayer = AztecAddress.random();
        const initialBalance = BigInt(1e12);
        const inclusionFee = 100n;
        const tx = mockTx(1, {
          numberOfNonRevertiblePublicCallRequests: 0,
          numberOfRevertiblePublicCallRequests: 0,
          feePayer,
        });

        tx.data.constants.txContext.gasSettings = GasSettings.from({
          ...GasSettings.default(),
          inclusionFee: new Fr(inclusionFee),
        });

        worldStateDB.storageRead.mockResolvedValue(new Fr(initialBalance));
        worldStateDB.storageWrite.mockImplementation((address: AztecAddress, slot: Fr) =>
          Promise.resolve(computePublicDataTreeLeafSlot(address, slot).toBigInt()),
        );

        const [processed, failed] = await processor.process([tx], 1);

        expect(failed.map(f => f.error)).toEqual([]);
        expect(processed).toHaveLength(1);
        expect(publicExecutor.simulate).toHaveBeenCalledTimes(0);
        expect(worldStateDB.commit).toHaveBeenCalledTimes(1);
        expect(worldStateDB.rollbackToCommit).toHaveBeenCalledTimes(0);
        expect(worldStateDB.storageWrite).toHaveBeenCalledTimes(1);
        expect(processed[0].data.feePayer).toEqual(feePayer);
        expect(processed[0].txEffect.publicDataWrites[0]).toEqual(
          new PublicDataWrite(computeFeePayerBalanceLeafSlot(feePayer), new Fr(initialBalance - inclusionFee)),
        );
      });

      it('injects balance update with public enqueued call', async function () {
        const feePayer = AztecAddress.random();
        const initialBalance = BigInt(1e12);
        const inclusionFee = 100n;
        const tx = mockTx(1, {
          numberOfNonRevertiblePublicCallRequests: 0,
          numberOfRevertiblePublicCallRequests: 2,
          feePayer,
        });

        tx.data.constants.txContext.gasSettings = GasSettings.from({
          ...GasSettings.default(),
          inclusionFee: new Fr(inclusionFee),
        });

        worldStateDB.storageRead.mockResolvedValue(new Fr(initialBalance));
        worldStateDB.storageWrite.mockImplementation((address: AztecAddress, slot: Fr) =>
          Promise.resolve(computePublicDataTreeLeafSlot(address, slot).toBigInt()),
        );

        const [processed, failed] = await processor.process([tx], 1);

        expect(failed.map(f => f.error)).toEqual([]);
        expect(processed).toHaveLength(1);
        expect(processed[0].hash).toEqual(tx.getTxHash());
        expect(processed[0].clientIvcProof).toEqual(proof);
        expect(publicExecutor.simulate).toHaveBeenCalledTimes(2);
        expect(worldStateDB.commit).toHaveBeenCalledTimes(1);
        expect(worldStateDB.rollbackToCommit).toHaveBeenCalledTimes(0);
        expect(worldStateDB.storageWrite).toHaveBeenCalledTimes(1);
        expect(processed[0].data.feePayer).toEqual(feePayer);

        const transactionFee = processed[0].txEffect.transactionFee.toBigInt();
        expect(processed[0].txEffect.publicDataWrites[0]).toEqual(
          new PublicDataWrite(computeFeePayerBalanceLeafSlot(feePayer), new Fr(initialBalance - transactionFee)),
        );
      });

      it('tweaks existing balance update from claim', async function () {
        const feePayer = AztecAddress.random();
        const initialBalance = BigInt(1e12);
        const inclusionFee = 100n;
        const tx = mockTx(1, {
          numberOfNonRevertiblePublicCallRequests: 0,
          numberOfRevertiblePublicCallRequests: 0,
          feePayer,
        });

        tx.data.constants.txContext.gasSettings = GasSettings.from({
          ...GasSettings.default(),
          inclusionFee: new Fr(inclusionFee),
        });

        worldStateDB.storageRead.mockResolvedValue(Fr.ZERO);
        worldStateDB.storageWrite.mockImplementation((address: AztecAddress, slot: Fr) =>
          Promise.resolve(computePublicDataTreeLeafSlot(address, slot).toBigInt()),
        );

        // TODO: Find a better way to test this.
        // This is wrong. Private kernel tail cannot output any publicDataWrites.
        tx.data.forRollup!.end.publicDataWrites[0] = new PublicDataWrite(
          computeFeePayerBalanceLeafSlot(feePayer),
          new Fr(initialBalance),
        );

        const [processed, failed] = await processor.process([tx], 1);

        expect(failed.map(f => f.error)).toEqual([]);
        expect(processed).toHaveLength(1);
        expect(processed[0].hash).toEqual(tx.getTxHash());
        expect(processed[0].clientIvcProof).toEqual(proof);
        expect(worldStateDB.commit).toHaveBeenCalledTimes(1);
        expect(worldStateDB.rollbackToCommit).toHaveBeenCalledTimes(0);
        expect(worldStateDB.storageWrite).toHaveBeenCalledTimes(1);
        expect(processed[0].data.feePayer).toEqual(feePayer);

        const transactionFee = processed[0].txEffect.transactionFee.toBigInt();
        expect(processed[0].txEffect.publicDataWrites[0]).toEqual(
          new PublicDataWrite(computeFeePayerBalanceLeafSlot(feePayer), new Fr(initialBalance - transactionFee)),
        );
      });

      it('rejects tx if fee payer has not enough balance', async function () {
        const feePayer = AztecAddress.random();
        const initialBalance = 1n;
        const inclusionFee = 100n;
        const tx = mockTx(1, {
          numberOfNonRevertiblePublicCallRequests: 0,
          numberOfRevertiblePublicCallRequests: 0,
          feePayer,
        });

        tx.data.constants.txContext.gasSettings = GasSettings.from({
          ...GasSettings.default(),
          inclusionFee: new Fr(inclusionFee),
        });

        worldStateDB.storageRead.mockResolvedValue(new Fr(initialBalance));
        worldStateDB.storageWrite.mockImplementation((address: AztecAddress, slot: Fr) =>
          Promise.resolve(computePublicDataTreeLeafSlot(address, slot).toBigInt()),
        );

        const [processed, failed] = await processor.process([tx], 1);

        expect(processed).toHaveLength(0);
        expect(failed).toHaveLength(1);
        expect(failed[0].error.message).toMatch(/Not enough balance/i);
        expect(publicExecutor.simulate).toHaveBeenCalledTimes(0);
        expect(worldStateDB.commit).toHaveBeenCalledTimes(0);
        expect(worldStateDB.rollbackToCommit).toHaveBeenCalledTimes(0);
        expect(worldStateDB.storageWrite).toHaveBeenCalledTimes(0);
      });
    });
  });
});
