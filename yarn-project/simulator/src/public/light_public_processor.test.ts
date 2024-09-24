import {
  PublicDataWrite,
  PublicExecutionRequest,
  SimulationError,
  type TreeInfo,
  TxValidator,
  mockTx,
} from '@aztec/circuit-types';
import {
  AppendOnlyTreeSnapshot,
  AztecAddress,
  ContractStorageUpdateRequest,
  Fr,
  Gas,
  GasFees,
  GasSettings,
  GlobalVariables,
  Header,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  PUBLIC_DATA_TREE_HEIGHT,
  PartialStateReference,
  PublicAccumulatedDataBuilder,
  PublicDataTreeLeafPreimage,
  PublicDataUpdateRequest,
  RevertCode,
  StateReference,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot } from '@aztec/circuits.js/hash';
import { fr, makeSelector } from '@aztec/circuits.js/testing';
import { openTmpStore } from '@aztec/kv-store/utils';
import { type AppendOnlyTree, Poseidon, StandardTree, newTree } from '@aztec/merkle-tree';
import {
  LightPublicProcessor,
  type PublicExecutionResult,
  type PublicExecutor,
  WorldStateDB,
} from '@aztec/simulator';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { type MerkleTreeOperations } from '@aztec/world-state';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { PublicExecutionResultBuilder, makeFunctionCall } from '../mocks/fixtures.js';
import { Spied, SpyInstance } from 'jest-mock';

describe('public_processor', () => {
  let db: MockProxy<MerkleTreeOperations>;
  let worldStateDB: MockProxy<WorldStateDB>;
  let txValidator: MockProxy<TxValidator<any>>;
  let publicExecutorSpy: any;

  let root: Buffer;

  let processor: LightPublicProcessor;

  beforeEach(() => {
    db = mock<MerkleTreeOperations>();
    worldStateDB = mock<WorldStateDB>();

    root = Buffer.alloc(32, 5);

    db.getTreeInfo.mockResolvedValue({ root } as TreeInfo);
    worldStateDB.storageRead.mockResolvedValue(Fr.ZERO);
  });

  describe('with actual circuits', () => {
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

      txValidator = mock<TxValidator<any>>();

      processor = new LightPublicProcessor(
        db,
        worldStateDB,
        GlobalVariables.from({ ...GlobalVariables.empty(), gasFees: GasFees.default() }),
        header,
        txValidator,
        new NoopTelemetryClient(),
      );

      publicExecutorSpy = jest.spyOn(processor.publicExecutor, 'simulate')

      publicExecutorSpy.mockImplementation((req: PublicExecutionRequest) => {
        const result = PublicExecutionResultBuilder.fromPublicExecutionRequest({ request: req as PublicExecutionRequest }).build();
        return Promise.resolve(result);
      });
    });

    it('rolls back app logic db updates on failed public execution, but persists setup', async function () {
      const tx = mockTx(1, {
        hasLogs: true,
        numberOfNonRevertiblePublicCallRequests: 1,
        numberOfRevertiblePublicCallRequests: 1,
        hasPublicTeardownCallRequest: true,
      });

      const nonRevertibleRequests = tx.getNonRevertiblePublicExecutionRequests();
      const revertibleRequests = tx.getRevertiblePublicExecutionRequests();
      const teardownRequest = tx.getPublicTeardownExecutionRequest()!;


      const teardownGas = tx.data.constants.txContext.gasSettings.getTeardownLimits();
      const teardownResultSettings = { startGasLeft: teardownGas, endGasLeft: teardownGas };

      const nestedContractAddress = AztecAddress.fromBigInt(112233n);
      const contractSlotA = fr(0x100);
      const contractSlotB = fr(0x150);
      const contractSlotC = fr(0x200);
      const contractSlotD = fr(0x250);
      const contractSlotE = fr(0x300);
      const contractSlotF = fr(0x350);

      let simulatorCallCount = 0;
      const simulatorResults: PublicExecutionResult[] = [
        // Setup
        PublicExecutionResultBuilder.fromPublicExecutionRequest({
          request: nonRevertibleRequests[0],
          contractStorageUpdateRequests: [new ContractStorageUpdateRequest(contractSlotA, fr(0x101), 11)],
        }).build(),

        // App Logic
        PublicExecutionResultBuilder.fromPublicExecutionRequest({
          request: revertibleRequests[0],
          nestedExecutions: [
            PublicExecutionResultBuilder.fromFunctionCall({
              from: revertibleRequests[0].callContext.storageContractAddress,
              tx: makeFunctionCall('', nestedContractAddress, makeSelector(5)),
              contractStorageUpdateRequests: [
                new ContractStorageUpdateRequest(contractSlotA, fr(0x102), 13),
                new ContractStorageUpdateRequest(contractSlotB, fr(0x151), 14),
                new ContractStorageUpdateRequest(contractSlotC, fr(0x200), 15),
              ],
            }).build(),
            PublicExecutionResultBuilder.fromFunctionCall({
              from: revertibleRequests[0].contractAddress,
              tx: makeFunctionCall('', nestedContractAddress, makeSelector(5)),
              revertReason: new SimulationError('Simulation Failed', []),
            }).build(),
          ],
        }).build(),

        // Teardown
        PublicExecutionResultBuilder.fromPublicExecutionRequest({
          request: teardownRequest,
          nestedExecutions: [
            PublicExecutionResultBuilder.fromFunctionCall({
              from: teardownRequest.callContext.storageContractAddress,
              tx: makeFunctionCall('', nestedContractAddress, makeSelector(5)),
              contractStorageUpdateRequests: [
                new ContractStorageUpdateRequest(contractSlotC, fr(0x201), 16),
                new ContractStorageUpdateRequest(contractSlotD, fr(0x251), 17),
                new ContractStorageUpdateRequest(contractSlotE, fr(0x301), 18),
                new ContractStorageUpdateRequest(contractSlotF, fr(0x351), 19),
              ],
            }).build(teardownResultSettings),
          ],
        }).build(teardownResultSettings),
      ];

      jest.spyOn((processor as any).publicExecutor, 'simulate').mockImplementation(execution => {
        if (simulatorCallCount < simulatorResults.length) {
          return Promise.resolve(simulatorResults[simulatorCallCount++]);
        } else {
          throw new Error(`Unexpected execution request: ${execution}, call count: ${simulatorCallCount}`);
        }
      });

      await processor.process([tx]);

      expect(processor.publicExecutor.simulate).toHaveBeenCalledTimes(3);
      expect(worldStateDB.checkpoint).toHaveBeenCalledTimes(1);
      // We should not need to roll back to the checkpoint, the nested call reverting should not
      // mean that the parent call should revert!
      expect(worldStateDB.rollbackToCheckpoint).toHaveBeenCalledTimes(1);
      expect(worldStateDB.commit).toHaveBeenCalledTimes(1);
      expect(worldStateDB.rollbackToCommit).toHaveBeenCalledTimes(0);
    });

    it('fails a transaction that reverts in setup', async function () {
      const tx = mockTx(1, {
        numberOfNonRevertiblePublicCallRequests: 1,
        numberOfRevertiblePublicCallRequests: 1,
        hasPublicTeardownCallRequest: true,
      });

      const nonRevertibleRequests = tx.getNonRevertiblePublicExecutionRequests();
      const revertibleRequests = tx.getRevertiblePublicExecutionRequests();
      const teardownRequest = tx.getPublicTeardownExecutionRequest()!;

      const nestedContractAddress = AztecAddress.fromBigInt(112233n);
      const contractSlotA = fr(0x100);
      const contractSlotB = fr(0x150);
      const contractSlotC = fr(0x200);

      let simulatorCallCount = 0;
      const simulatorResults: PublicExecutionResult[] = [
        // Setup
        PublicExecutionResultBuilder.fromPublicExecutionRequest({
          request: nonRevertibleRequests[0],
          contractStorageUpdateRequests: [new ContractStorageUpdateRequest(contractSlotA, fr(0x101), 11)],
          nestedExecutions: [
            PublicExecutionResultBuilder.fromFunctionCall({
              from: nonRevertibleRequests[0].callContext.storageContractAddress,
              tx: makeFunctionCall('', nestedContractAddress, makeSelector(5)),
              contractStorageUpdateRequests: [
                new ContractStorageUpdateRequest(contractSlotA, fr(0x102), 12),
                new ContractStorageUpdateRequest(contractSlotB, fr(0x151), 13),
              ],
            }).build(),
            PublicExecutionResultBuilder.fromFunctionCall({
              from: nonRevertibleRequests[0].callContext.storageContractAddress,
              tx: makeFunctionCall('', nestedContractAddress, makeSelector(5)),
              revertReason: new SimulationError('Simulation Failed', []),
            }).build(),
          ],
        }).build(),

        // App Logic
        PublicExecutionResultBuilder.fromPublicExecutionRequest({
          request: revertibleRequests[0],
        }).build(),

        // Teardown
        PublicExecutionResultBuilder.fromPublicExecutionRequest({
          request: teardownRequest,
          nestedExecutions: [
            PublicExecutionResultBuilder.fromFunctionCall({
              from: teardownRequest.callContext.storageContractAddress,
              tx: makeFunctionCall('', nestedContractAddress, makeSelector(5)),
              contractStorageUpdateRequests: [new ContractStorageUpdateRequest(contractSlotC, fr(0x202), 16)],
            }).build(),
          ],
        }).build(),
      ];


      jest.spyOn((processor as any).publicExecutor, 'simulate').mockImplementation(execution => {
        if (simulatorCallCount < simulatorResults.length) {
          return Promise.resolve(simulatorResults[simulatorCallCount++]);
        } else {
          throw new Error(`Unexpected execution request: ${execution}, call count: ${simulatorCallCount}`);
        }
      });

      await processor.process([tx]);

      expect(processor.publicExecutor.simulate).toHaveBeenCalledTimes(1);

      expect(worldStateDB.checkpoint).toHaveBeenCalledTimes(0);
      expect(worldStateDB.rollbackToCheckpoint).toHaveBeenCalledTimes(0);
      expect(worldStateDB.commit).toHaveBeenCalledTimes(0);
      expect(worldStateDB.rollbackToCommit).toHaveBeenCalledTimes(1);
    });

    it('includes a transaction that reverts in teardown', async function () {
      const tx = mockTx(1, {
        hasLogs: true,
        numberOfNonRevertiblePublicCallRequests: 1,
        numberOfRevertiblePublicCallRequests: 1,
        hasPublicTeardownCallRequest: true,
      });

      const nonRevertibleRequests = tx.getNonRevertiblePublicExecutionRequests();
      const revertibleRequests = tx.getRevertiblePublicExecutionRequests();
      const teardownRequest = tx.getPublicTeardownExecutionRequest()!;

      const teardownGas = tx.data.constants.txContext.gasSettings.getTeardownLimits();
      const teardownResultSettings = { startGasLeft: teardownGas, endGasLeft: teardownGas };

      const nestedContractAddress = AztecAddress.fromBigInt(112233n);
      const contractSlotA = fr(0x100);
      const contractSlotB = fr(0x150);
      const contractSlotC = fr(0x200);

      let simulatorCallCount = 0;
      const simulatorResults: PublicExecutionResult[] = [
        // Setup
        PublicExecutionResultBuilder.fromPublicExecutionRequest({
          request: nonRevertibleRequests[0],
          contractStorageUpdateRequests: [new ContractStorageUpdateRequest(contractSlotA, fr(0x101), 11)],
          nestedExecutions: [
            PublicExecutionResultBuilder.fromFunctionCall({
              from: nonRevertibleRequests[0].callContext.storageContractAddress,
              tx: makeFunctionCall('', nestedContractAddress, makeSelector(5)),
              contractStorageUpdateRequests: [
                new ContractStorageUpdateRequest(contractSlotA, fr(0x102), 12),
                new ContractStorageUpdateRequest(contractSlotB, fr(0x151), 13),
              ],
            }).build(),
          ],
        }).build(),

        // App Logic
        PublicExecutionResultBuilder.fromPublicExecutionRequest({
          request: revertibleRequests[0],
          contractStorageUpdateRequests: [
            new ContractStorageUpdateRequest(contractSlotB, fr(0x152), 14),
            new ContractStorageUpdateRequest(contractSlotC, fr(0x201), 15),
          ],
        }).build(),

        // Teardown
        PublicExecutionResultBuilder.fromPublicExecutionRequest({
          request: teardownRequest,
          nestedExecutions: [
            PublicExecutionResultBuilder.fromFunctionCall({
              from: teardownRequest.callContext.storageContractAddress,
              tx: makeFunctionCall('', nestedContractAddress, makeSelector(5)),
              contractStorageUpdateRequests: [new ContractStorageUpdateRequest(contractSlotC, fr(0x202), 16)],
            }).build(teardownResultSettings),
            PublicExecutionResultBuilder.fromFunctionCall({
              from: teardownRequest.callContext.storageContractAddress,
              tx: makeFunctionCall('', nestedContractAddress, makeSelector(5)),
              contractStorageUpdateRequests: [new ContractStorageUpdateRequest(contractSlotC, fr(0x202), 17)],
              revertReason: new SimulationError('Simulation Failed', []),
            }).build(teardownResultSettings),
          ],
        }).build(teardownResultSettings),
      ];

      jest.spyOn(processor.publicExecutor, 'simulate').mockImplementation(execution => {
        if (simulatorCallCount < simulatorResults.length) {
          return Promise.resolve(simulatorResults[simulatorCallCount++]);
        } else {
          throw new Error(`Unexpected execution request: ${execution}, call count: ${simulatorCallCount}`);
        }
      });

      await processor.process([tx]);

      expect(processor.publicExecutor.simulate).toHaveBeenCalledTimes(3);
      expect(worldStateDB.checkpoint).toHaveBeenCalledTimes(1);
      expect(worldStateDB.rollbackToCheckpoint).toHaveBeenCalledTimes(1);
      expect(worldStateDB.commit).toHaveBeenCalledTimes(1);
      expect(worldStateDB.rollbackToCommit).toHaveBeenCalledTimes(0);


      // we keep the non-revertible logs
      // TODO: keep track of this
      // expect(txEffect.encryptedLogs.getTotalLogCount()).toBe(3);
      // expect(txEffect.unencryptedLogs.getTotalLogCount()).toBe(1);

      // expect(processed[0].data.revertCode).toEqual(RevertCode.TEARDOWN_REVERTED);

      // expect(prover.addNewTx).toHaveBeenCalledWith(processed[0]);
    });
  });
});
