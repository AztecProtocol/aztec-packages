import {
  type PublicExecutionRequest,
  SimulationError,
  type TreeInfo,
  type TxValidator,
  mockTx,
} from '@aztec/circuit-types';
import {
  AppendOnlyTreeSnapshot,
  AztecAddress,
  ContractStorageRead,
  ContractStorageUpdateRequest,
  Fr,
  Gas,
  GasFees,
  GasSettings,
  GlobalVariables,
  Header,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  PUBLIC_DATA_TREE_HEIGHT,
  PartialStateReference,
  PublicAccumulatedDataBuilder,
  PublicDataTreeLeafPreimage,
  PublicDataUpdateRequest,
  StateReference,
} from '@aztec/circuits.js';
import { fr, makeSelector } from '@aztec/circuits.js/testing';
import { padArrayEnd } from '@aztec/foundation/collection';
import { type FieldsOf } from '@aztec/foundation/types';
import { openTmpStore } from '@aztec/kv-store/utils';
import { type AppendOnlyTree, Poseidon, StandardTree, newTree } from '@aztec/merkle-tree';
import { LightPublicProcessor, type PublicExecutionResult, type WorldStateDB } from '@aztec/simulator';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { type MerkleTreeOperations } from '@aztec/world-state';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { PublicExecutionResultBuilder, makeFunctionCall } from '../mocks/fixtures.js';
import { type NewStateUpdates } from './light_public_processor.js';

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
    txValidator = mock<TxValidator<any>>();

    root = Buffer.alloc(32, 5);

    db.getTreeInfo.mockResolvedValue({ root } as TreeInfo);
    worldStateDB.storageRead.mockResolvedValue(Fr.ZERO);

    // Always return true for validation
    txValidator.validateTxs.mockImplementation((txs: any[]) => {
      return Promise.resolve([txs, []]);
    });
  });

  describe('Light Public Processor', () => {
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

      processor = new LightPublicProcessor(
        db,
        worldStateDB,
        GlobalVariables.from({ ...GlobalVariables.empty(), gasFees: GasFees.default() }),
        header,
        txValidator,
        new NoopTelemetryClient(),
      );

      publicExecutorSpy = jest.spyOn(processor.publicExecutor, 'simulate');

      publicExecutorSpy.mockImplementation((req: PublicExecutionRequest) => {
        const result = PublicExecutionResultBuilder.fromPublicExecutionRequest({
          request: req as PublicExecutionRequest,
        }).build();
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

      await expect(async () => {
        await processor.process([tx]);
      }).rejects.toThrow('Reverted in setup');

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
    });

    it('includes a transaction that reverts in app logic and teardown', async function () {
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
          revertReason: new SimulationError('Simulation Failed', []),
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
              contractStorageUpdateRequests: [new ContractStorageUpdateRequest(contractSlotC, fr(0x202), 16)],
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

      const stateUpdateSpy = jest.spyOn(processor as any, 'writeStateUpdates');

      await processor.process([tx]);

      expect(worldStateDB.checkpoint).toHaveBeenCalledTimes(1);
      expect(worldStateDB.rollbackToCheckpoint).toHaveBeenCalledTimes(2);
      expect(worldStateDB.commit).toHaveBeenCalledTimes(1);
      expect(worldStateDB.rollbackToCommit).toHaveBeenCalledTimes(0);

      const nestContractAddress = simulatorResults[0].nestedExecutions[0].executionRequest.contractAddress;
      const expectedPublicDataWrites = [
        PublicDataUpdateRequest.fromContractStorageUpdateRequest(
          nonRevertibleRequests[0].callContext.storageContractAddress,
          new ContractStorageUpdateRequest(contractSlotA, fr(0x101), 11),
        ),
        PublicDataUpdateRequest.fromContractStorageUpdateRequest(
          nestContractAddress,
          new ContractStorageUpdateRequest(contractSlotA, fr(0x102), 12),
        ),
        PublicDataUpdateRequest.fromContractStorageUpdateRequest(
          nestContractAddress,
          new ContractStorageUpdateRequest(contractSlotB, fr(0x151), 13),
        ),
      ];
      // Tx hash + state updates
      const expectedStateUpdatesOpject: NewStateUpdates = {
        nullifiers: padArrayEnd([tx.data.getNonEmptyNullifiers()[0]], Fr.ZERO, MAX_NULLIFIERS_PER_TX),
        noteHashes: padArrayEnd([], Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
        publicDataWrites: expectedPublicDataWrites,
      };
      expect(stateUpdateSpy).toHaveBeenCalledWith(expectedStateUpdatesOpject);
    });

    it('runs a tx with all phases', async function () {
      const tx = mockTx(1, {
        numberOfNonRevertiblePublicCallRequests: 1,
        numberOfRevertiblePublicCallRequests: 1,
        hasPublicTeardownCallRequest: true,
      });

      const nonRevertibleRequests = tx.getNonRevertiblePublicExecutionRequests();
      const revertibleRequests = tx.getRevertiblePublicExecutionRequests();
      const teardownRequest = tx.getPublicTeardownExecutionRequest()!;

      // TODO(md): gas
      const gasLimits = Gas.from({ l2Gas: 1e9, daGas: 1e9 });
      const teardownGas = Gas.from({ l2Gas: 1e7, daGas: 1e7 });
      tx.data.constants.txContext.gasSettings = GasSettings.from({
        gasLimits: gasLimits,
        teardownGasLimits: teardownGas,
        inclusionFee: new Fr(1e4),
        maxFeesPerGas: { feePerDaGas: new Fr(10), feePerL2Gas: new Fr(10) },
      });

      // Private kernel tail to public pushes teardown gas allocation into revertible gas used
      tx.data.forPublic!.end = PublicAccumulatedDataBuilder.fromPublicAccumulatedData(tx.data.forPublic!.end)
        .withGasUsed(teardownGas)
        .build();
      tx.data.forPublic!.endNonRevertibleData = PublicAccumulatedDataBuilder.fromPublicAccumulatedData(
        tx.data.forPublic!.endNonRevertibleData,
      )
        .withGasUsed(Gas.empty())
        .build();

      const nestedContractAddress = revertibleRequests[0].callContext.storageContractAddress;
      const contractSlotA = fr(0x100);
      const contractSlotB = fr(0x150);
      const contractSlotC = fr(0x200);

      let simulatorCallCount = 0;

      const initialGas = gasLimits.sub(teardownGas);
      const setupGasUsed = Gas.from({ l2Gas: 1e6 });
      const appGasUsed = Gas.from({ l2Gas: 2e6, daGas: 2e6 });
      const teardownGasUsed = Gas.from({ l2Gas: 3e6, daGas: 3e6 });
      const afterSetupGas = initialGas.sub(setupGasUsed);
      const afterAppGas = afterSetupGas.sub(appGasUsed);
      const afterTeardownGas = teardownGas.sub(teardownGasUsed);

      // Inclusion fee plus block gas fees times total gas used
      const expectedTxFee = 1e4 + (1e7 + 1e6 + 2e6) * 1 + (1e7 + 2e6) * 1;
      const transactionFee = new Fr(expectedTxFee);

      const simulatorResults: PublicExecutionResult[] = [
        // Setup
        PublicExecutionResultBuilder.fromPublicExecutionRequest({ request: nonRevertibleRequests[0] }).build({
          startGasLeft: initialGas,
          endGasLeft: afterSetupGas,
        }),

        // App Logic
        PublicExecutionResultBuilder.fromPublicExecutionRequest({
          request: revertibleRequests[0],
          contractStorageUpdateRequests: [
            new ContractStorageUpdateRequest(contractSlotA, fr(0x101), 10),
            new ContractStorageUpdateRequest(contractSlotB, fr(0x151), 11),
          ],
          contractStorageReads: [new ContractStorageRead(contractSlotA, fr(0x100), 19)],
        }).build({
          startGasLeft: afterSetupGas,
          endGasLeft: afterAppGas,
        }),

        // Teardown
        PublicExecutionResultBuilder.fromPublicExecutionRequest({
          request: teardownRequest,
          nestedExecutions: [
            PublicExecutionResultBuilder.fromFunctionCall({
              from: teardownRequest.callContext.storageContractAddress,
              tx: makeFunctionCall('', nestedContractAddress, makeSelector(5)),
              contractStorageUpdateRequests: [
                new ContractStorageUpdateRequest(contractSlotA, fr(0x103), 16),
                new ContractStorageUpdateRequest(contractSlotC, fr(0x201), 17),
              ],
              contractStorageReads: [new ContractStorageRead(contractSlotA, fr(0x102), 15)],
            }).build({ startGasLeft: teardownGas, endGasLeft: teardownGas, transactionFee }),
            PublicExecutionResultBuilder.fromFunctionCall({
              from: teardownRequest.callContext.storageContractAddress,
              tx: makeFunctionCall('', nestedContractAddress, makeSelector(5)),
              contractStorageUpdateRequests: [
                new ContractStorageUpdateRequest(contractSlotA, fr(0x102), 13),
                new ContractStorageUpdateRequest(contractSlotB, fr(0x152), 14),
              ],
              contractStorageReads: [new ContractStorageRead(contractSlotA, fr(0x101), 12)],
            }).build({ startGasLeft: teardownGas, endGasLeft: teardownGas, transactionFee }),
          ],
        }).build({
          startGasLeft: teardownGas,
          endGasLeft: afterTeardownGas,
          transactionFee,
        }),
      ];

      jest.spyOn(processor.publicExecutor, 'simulate').mockImplementation(execution => {
        if (simulatorCallCount < simulatorResults.length) {
          const result = simulatorResults[simulatorCallCount++];
          return Promise.resolve(result);
        } else {
          throw new Error(`Unexpected execution request: ${execution}, call count: ${simulatorCallCount}`);
        }
      });

      const stateUpdateSpy = jest.spyOn(processor as any, 'writeStateUpdates');

      await processor.process([tx]);

      const expectedSimulateCall = (availableGas: Partial<FieldsOf<Gas>>, _txFee: number) => [
        expect.anything(), // PublicExecution
        expect.anything(), // GlobalVariables
        Gas.from(availableGas),
        expect.anything(), // TxContext
        expect.anything(), // pendingNullifiers
        new Fr(0),
        // new Fr(txFee),
        expect.anything(), // SideEffectCounter
      ];

      expect(processor.publicExecutor.simulate).toHaveBeenCalledTimes(3);
      expect(processor.publicExecutor.simulate).toHaveBeenNthCalledWith(1, ...expectedSimulateCall(initialGas, 0));
      expect(processor.publicExecutor.simulate).toHaveBeenNthCalledWith(2, ...expectedSimulateCall(afterSetupGas, 0));
      expect(processor.publicExecutor.simulate).toHaveBeenNthCalledWith(
        3,
        ...expectedSimulateCall(teardownGas, expectedTxFee),
      );

      expect(worldStateDB.checkpoint).toHaveBeenCalledTimes(1);
      expect(worldStateDB.rollbackToCheckpoint).toHaveBeenCalledTimes(0);
      expect(worldStateDB.commit).toHaveBeenCalledTimes(1);
      expect(worldStateDB.rollbackToCommit).toHaveBeenCalledTimes(0);

      const expectedPublicDataWrites = [
        PublicDataUpdateRequest.fromContractStorageUpdateRequest(
          nestedContractAddress,
          new ContractStorageUpdateRequest(contractSlotA, fr(0x103), 16),
        ),
        PublicDataUpdateRequest.fromContractStorageUpdateRequest(
          nestedContractAddress,
          new ContractStorageUpdateRequest(contractSlotC, fr(0x201), 17),
        ),
        PublicDataUpdateRequest.fromContractStorageUpdateRequest(
          nestedContractAddress,
          new ContractStorageUpdateRequest(contractSlotB, fr(0x152), 14),
        ),
      ];
      // Tx hash + state updates
      const expectedStateUpdatesOpject: NewStateUpdates = {
        nullifiers: padArrayEnd([tx.data.getNonEmptyNullifiers()[0]], Fr.ZERO, MAX_NULLIFIERS_PER_TX),
        noteHashes: padArrayEnd([], Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
        publicDataWrites: expectedPublicDataWrites,
      };
      expect(stateUpdateSpy).toHaveBeenCalledWith(expectedStateUpdatesOpject);
    });

    it('runs a tx with only teardown', async function () {
      const tx = mockTx(1, {
        numberOfNonRevertiblePublicCallRequests: 0,
        numberOfRevertiblePublicCallRequests: 0,
        hasPublicTeardownCallRequest: true,
      });

      const teardownRequest = tx.getPublicTeardownExecutionRequest()!;

      const gasLimits = Gas.from({ l2Gas: 1e9, daGas: 1e9 });
      const teardownGas = Gas.from({ l2Gas: 1e7, daGas: 1e7 });
      tx.data.constants.txContext.gasSettings = GasSettings.from({
        gasLimits: gasLimits,
        teardownGasLimits: teardownGas,
        inclusionFee: new Fr(1e4),
        maxFeesPerGas: { feePerDaGas: new Fr(10), feePerL2Gas: new Fr(10) },
      });

      // Private kernel tail to public pushes teardown gas allocation into revertible gas used
      tx.data.forPublic!.end = PublicAccumulatedDataBuilder.fromPublicAccumulatedData(tx.data.forPublic!.end)
        .withGasUsed(teardownGas)
        .build();
      tx.data.forPublic!.endNonRevertibleData = PublicAccumulatedDataBuilder.fromPublicAccumulatedData(
        tx.data.forPublic!.endNonRevertibleData,
      )
        .withGasUsed(Gas.empty())
        .build();

      let simulatorCallCount = 0;
      const txOverhead = 1e4;
      const expectedTxFee = txOverhead + teardownGas.l2Gas * 1 + teardownGas.daGas * 1;
      const transactionFee = new Fr(expectedTxFee);
      const teardownGasUsed = Gas.from({ l2Gas: 1e6, daGas: 1e6 });

      const simulatorResults: PublicExecutionResult[] = [
        // Teardown
        PublicExecutionResultBuilder.fromPublicExecutionRequest({
          request: teardownRequest,
          nestedExecutions: [],
        }).build({
          startGasLeft: teardownGas,
          endGasLeft: teardownGas.sub(teardownGasUsed),
          transactionFee,
        }),
      ];

      jest.spyOn(processor.publicExecutor, 'simulate').mockImplementation(execution => {
        if (simulatorCallCount < simulatorResults.length) {
          const result = simulatorResults[simulatorCallCount++];
          return Promise.resolve(result);
        } else {
          throw new Error(`Unexpected execution request: ${execution}, call count: ${simulatorCallCount}`);
        }
      });

      await processor.process([tx]);
    });
  });
});
