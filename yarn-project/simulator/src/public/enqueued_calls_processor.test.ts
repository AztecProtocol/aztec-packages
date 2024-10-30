import { type MerkleTreeWriteOperations, SimulationError, type TreeInfo, mockTx } from '@aztec/circuit-types';
import {
  AppendOnlyTreeSnapshot,
  AztecAddress,
  Fr,
  Gas,
  GasFees,
  GasSettings,
  GlobalVariables,
  Header,
  PUBLIC_DATA_TREE_HEIGHT,
  PartialStateReference,
  PublicAccumulatedDataBuilder,
  PublicDataTreeLeafPreimage,
  PublicDataUpdateRequest,
  RevertCode,
  StateReference,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot } from '@aztec/circuits.js/hash';
import { fr } from '@aztec/circuits.js/testing';
import { arrayNonEmptyLength } from '@aztec/foundation/collection';
import { type FieldsOf } from '@aztec/foundation/types';
import { openTmpStore } from '@aztec/kv-store/utils';
import { type AppendOnlyTree, Poseidon, StandardTree, newTree } from '@aztec/merkle-tree';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { type AvmPersistableStateManager } from '../avm/journal/journal.js';
import { PublicExecutionResultBuilder } from '../mocks/fixtures.js';
import { WASMSimulator } from '../providers/acvm_wasm.js';
import { EnqueuedCallsProcessor } from './enqueued_calls_processor.js';
import { type PublicExecutionResult } from './execution.js';
import { type PublicExecutor } from './executor.js';
import { type WorldStateDB } from './public_db_sources.js';
import { RealPublicKernelCircuitSimulator } from './public_kernel.js';
import { type PublicKernelCircuitSimulator } from './public_kernel_circuit_simulator.js';

describe('enqueued_calls_processor', () => {
  let db: MockProxy<MerkleTreeWriteOperations>;
  let publicExecutor: MockProxy<PublicExecutor>;
  let publicKernel: PublicKernelCircuitSimulator;
  let worldStateDB: MockProxy<WorldStateDB>;

  let root: Buffer;
  let publicDataTree: AppendOnlyTree<Fr>;

  let processor: EnqueuedCallsProcessor;

  beforeEach(async () => {
    db = mock<MerkleTreeWriteOperations>();
    publicExecutor = mock<PublicExecutor>();
    worldStateDB = mock<WorldStateDB>();
    root = Buffer.alloc(32, 5);

    publicDataTree = await newTree(
      StandardTree,
      openTmpStore(),
      new Poseidon(),
      'PublicData',
      Fr,
      PUBLIC_DATA_TREE_HEIGHT,
      1, // Add a default low leaf for the public data hints to be proved against.
    );
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

    db.getTreeInfo.mockResolvedValue({ root } as TreeInfo);
    db.getStateReference.mockResolvedValue(stateReference);
    db.getSiblingPath.mockResolvedValue(publicDataTree.getSiblingPath(0n, false));
    db.getPreviousValueIndex.mockResolvedValue({ index: 0n, alreadyPresent: true });
    db.getLeafPreimage.mockResolvedValue(new PublicDataTreeLeafPreimage(new Fr(0), new Fr(0), new Fr(0), 0n));

    publicKernel = new RealPublicKernelCircuitSimulator(new WASMSimulator());

    processor = EnqueuedCallsProcessor.create(
      db,
      publicExecutor,
      publicKernel,
      GlobalVariables.from({ ...GlobalVariables.empty(), gasFees: GasFees.default() }),
      Header.empty(),
      worldStateDB,
    );
  });

  it('runs a tx with enqueued public calls', async function () {
    const tx = mockTx(1, {
      numberOfNonRevertiblePublicCallRequests: 0,
      numberOfRevertiblePublicCallRequests: 2,
      hasLogs: true,
    });

    publicExecutor.simulate.mockImplementation((_stateManager, request) => {
      const result = PublicExecutionResultBuilder.fromPublicExecutionRequest({ request }).build();
      return Promise.resolve(result);
    });

    const tailSpy = jest.spyOn(publicKernel, 'publicKernelCircuitTail');

    const txResult = await processor.process(tx);

    expect(txResult.processedPhases).toHaveLength(1);
    expect(txResult.processedPhases[0]).toEqual(expect.objectContaining({ revertReason: undefined }));
    expect(txResult.revertReason).toBe(undefined);

    expect(tailSpy).toHaveBeenCalledTimes(1);
    expect(publicExecutor.simulate).toHaveBeenCalledTimes(2);

    const outputs = txResult.tailKernelOutput.end;
    // we keep the non-revertible logs
    expect(arrayNonEmptyLength(outputs.encryptedLogsHashes, l => l.logHash.isEmpty())).toBe(6);
    expect(arrayNonEmptyLength(outputs.unencryptedLogsHashes, l => l.logHash.isEmpty())).toBe(2);

    expect(txResult.tailKernelOutput.revertCode).toEqual(RevertCode.OK);
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

    const teardownFailure = new SimulationError('Simulation Failed in teardown', []);
    const simulatorResults: PublicExecutionResult[] = [
      // Setup
      PublicExecutionResultBuilder.fromPublicExecutionRequest({
        request: nonRevertibleRequests[0],
      }).build(),

      // App Logic
      PublicExecutionResultBuilder.fromPublicExecutionRequest({
        request: revertibleRequests[0],
      }).build(),

      // Teardown
      PublicExecutionResultBuilder.fromPublicExecutionRequest({
        request: teardownRequest,
        // revert at top-level of teardown enqueued call
        revertReason: teardownFailure,
      }).build(teardownResultSettings),
    ];
    const mockedSimulatorExecutions = [
      // SETUP
      (stateManager: AvmPersistableStateManager) => {
        // mock storage writes on the state manager
        stateManager.writeStorage(nonRevertibleRequests[0].callContext.contractAddress, contractSlotA, fr(0x101));
        stateManager.writeStorage(nestedContractAddress, contractSlotA, fr(0x102));
        stateManager.writeStorage(nestedContractAddress, contractSlotB, fr(0x151));
        return Promise.resolve(simulatorResults[0]);
      },
      // APP LOGIC
      (stateManager: AvmPersistableStateManager) => {
        // mock storage writes on the state manager
        stateManager.writeStorage(revertibleRequests[0].callContext.contractAddress, contractSlotB, fr(0x152));
        stateManager.writeStorage(revertibleRequests[0].callContext.contractAddress, contractSlotC, fr(0x201));
        return Promise.resolve(simulatorResults[1]);
      },
      (stateManager: AvmPersistableStateManager) => {
        // mock storage writes on the state manager
        stateManager.writeStorage(nestedContractAddress, contractSlotC, fr(0x202));
        stateManager.writeStorage(nestedContractAddress, contractSlotC, fr(0x202));
        return Promise.resolve(simulatorResults[2]);
      },
    ];

    for (const executeSimulator of mockedSimulatorExecutions) {
      publicExecutor.simulate.mockImplementationOnce(
        (stateManager: AvmPersistableStateManager): Promise<PublicExecutionResult> => {
          return executeSimulator(stateManager);
        },
      );
    }

    const tailSpy = jest.spyOn(publicKernel, 'publicKernelCircuitTail');

    const txResult = await processor.process(tx);

    expect(txResult.processedPhases).toHaveLength(3);
    expect(txResult.processedPhases[0]).toEqual(expect.objectContaining({ revertReason: undefined }));
    expect(txResult.processedPhases[1]).toEqual(expect.objectContaining({ revertReason: undefined }));
    expect(txResult.processedPhases[2]).toEqual(expect.objectContaining({ revertReason: teardownFailure }));
    expect(txResult.revertReason).toBe(teardownFailure);

    expect(tailSpy).toHaveBeenCalledTimes(1);
    expect(publicExecutor.simulate).toHaveBeenCalledTimes(3);

    const outputs = txResult.tailKernelOutput.end;
    const numPublicDataWrites = 3;
    expect(arrayNonEmptyLength(outputs.publicDataUpdateRequests, PublicDataUpdateRequest.isEmpty)).toBe(
      numPublicDataWrites,
    );
    expect(outputs.publicDataUpdateRequests.slice(0, numPublicDataWrites)).toEqual([
      expect.objectContaining({
        leafSlot: computePublicDataTreeLeafSlot(nonRevertibleRequests[0].callContext.contractAddress, contractSlotA),
        newValue: fr(0x101),
      }),
      expect.objectContaining({
        leafSlot: computePublicDataTreeLeafSlot(nestedContractAddress, contractSlotA),
        newValue: fr(0x102),
      }),
      expect.objectContaining({
        leafSlot: computePublicDataTreeLeafSlot(nestedContractAddress, contractSlotB),
        newValue: fr(0x151),
      }),
    ]);

    // we keep the non-revertible logs
    expect(arrayNonEmptyLength(outputs.encryptedLogsHashes, l => l.logHash.isEmpty())).toBe(3);
    expect(arrayNonEmptyLength(outputs.unencryptedLogsHashes, l => l.logHash.isEmpty())).toBe(1);
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

    const setupFailureMsg = 'Simulation Failed in setup';
    const setupFailure = new SimulationError(setupFailureMsg, []);
    const simulatorResults: PublicExecutionResult[] = [
      // Setup
      PublicExecutionResultBuilder.fromPublicExecutionRequest({
        request: nonRevertibleRequests[0],
        revertReason: setupFailure,
      }).build(),

      // App Logic
      PublicExecutionResultBuilder.fromPublicExecutionRequest({
        request: revertibleRequests[0],
      }).build(),

      // Teardown
      PublicExecutionResultBuilder.fromPublicExecutionRequest({
        request: teardownRequest,
      }).build(),
    ];
    const mockedSimulatorExecutions = [
      // SETUP
      (stateManager: AvmPersistableStateManager) => {
        // mock storage writes on the state manager
        stateManager.writeStorage(nonRevertibleRequests[0].callContext.contractAddress, contractSlotA, fr(0x101));
        stateManager.writeStorage(nestedContractAddress, contractSlotA, fr(0x102));
        stateManager.writeStorage(nestedContractAddress, contractSlotB, fr(0x151));
        return Promise.resolve(simulatorResults[0]);
      },
      // APP LOGIC
      (_stateManager: AvmPersistableStateManager) => {
        // mock storage writes on the state manager
        return Promise.resolve(simulatorResults[1]);
      },
      (stateManager: AvmPersistableStateManager) => {
        // mock storage writes on the state manager
        stateManager.writeStorage(nestedContractAddress, contractSlotC, fr(0x202));
        return Promise.resolve(simulatorResults[2]);
      },
    ];

    for (const executeSimulator of mockedSimulatorExecutions) {
      publicExecutor.simulate.mockImplementationOnce(
        (stateManager: AvmPersistableStateManager): Promise<PublicExecutionResult> => {
          return executeSimulator(stateManager);
        },
      );
    }

    const tailSpy = jest.spyOn(publicKernel, 'publicKernelCircuitTail');

    await expect(processor.process(tx)).rejects.toThrow(setupFailureMsg);

    expect(tailSpy).toHaveBeenCalledTimes(0);
    expect(publicExecutor.simulate).toHaveBeenCalledTimes(1);
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

    const appLogicFailure = new SimulationError('Simulation Failed in app logic', []);
    const simulatorResults: PublicExecutionResult[] = [
      // Setup
      PublicExecutionResultBuilder.fromPublicExecutionRequest({
        request: nonRevertibleRequests[0],
      }).build(),

      // App Logic
      PublicExecutionResultBuilder.fromPublicExecutionRequest({
        request: revertibleRequests[0],
        revertReason: appLogicFailure,
      }).build(),

      // Teardown
      PublicExecutionResultBuilder.fromPublicExecutionRequest({
        request: teardownRequest,
      }).build(teardownResultSettings),
    ];

    const mockedSimulatorExecutions = [
      // SETUP
      (stateManager: AvmPersistableStateManager) => {
        // mock storage writes on the state manager
        stateManager.writeStorage(nonRevertibleRequests[0].callContext.contractAddress, contractSlotA, fr(0x101));
        return Promise.resolve(simulatorResults[0]);
      },
      // APP LOGIC
      (stateManager: AvmPersistableStateManager) => {
        // mock storage writes on the state manager
        stateManager.writeStorage(nestedContractAddress, contractSlotA, fr(0x102));
        stateManager.writeStorage(nestedContractAddress, contractSlotB, fr(0x151));
        stateManager.writeStorage(nestedContractAddress, contractSlotC, fr(0x200));
        return Promise.resolve(simulatorResults[1]);
      },
      (stateManager: AvmPersistableStateManager) => {
        // mock storage writes on the state manager
        stateManager.writeStorage(nestedContractAddress, contractSlotC, fr(0x201));
        stateManager.writeStorage(nestedContractAddress, contractSlotD, fr(0x251));
        stateManager.writeStorage(nestedContractAddress, contractSlotE, fr(0x301));
        stateManager.writeStorage(nestedContractAddress, contractSlotF, fr(0x351));
        return Promise.resolve(simulatorResults[2]);
      },
    ];

    for (const executeSimulator of mockedSimulatorExecutions) {
      publicExecutor.simulate.mockImplementationOnce(
        (stateManager: AvmPersistableStateManager): Promise<PublicExecutionResult> => {
          return executeSimulator(stateManager);
        },
      );
    }

    const tailSpy = jest.spyOn(publicKernel, 'publicKernelCircuitTail');

    const txResult = await processor.process(tx);

    expect(publicExecutor.simulate).toHaveBeenCalledTimes(3);

    expect(txResult.processedPhases).toHaveLength(3);
    expect(txResult.processedPhases[0]).toEqual(expect.objectContaining({ revertReason: undefined }));
    expect(txResult.processedPhases[1]).toEqual(expect.objectContaining({ revertReason: appLogicFailure }));
    expect(txResult.processedPhases[2]).toEqual(expect.objectContaining({ revertReason: undefined }));
    // tx reports app logic failure
    expect(txResult.revertReason).toBe(appLogicFailure);

    expect(tailSpy).toHaveBeenCalledTimes(1);
    expect(publicExecutor.simulate).toHaveBeenCalledTimes(3);

    const outputs = txResult.tailKernelOutput.end;
    const numPublicDataWrites = 5;
    expect(arrayNonEmptyLength(outputs.publicDataUpdateRequests, PublicDataUpdateRequest.isEmpty)).toBe(
      numPublicDataWrites,
    );
    expect(outputs.publicDataUpdateRequests.slice(0, numPublicDataWrites)).toEqual([
      expect.objectContaining({
        leafSlot: computePublicDataTreeLeafSlot(nonRevertibleRequests[0].callContext.contractAddress, contractSlotA),
        newValue: fr(0x101),
      }),
      expect.objectContaining({
        leafSlot: computePublicDataTreeLeafSlot(nestedContractAddress, contractSlotC),
        newValue: fr(0x201),
      }),
      expect.objectContaining({
        leafSlot: computePublicDataTreeLeafSlot(nestedContractAddress, contractSlotD),
        newValue: fr(0x251),
      }),
      expect.objectContaining({
        leafSlot: computePublicDataTreeLeafSlot(nestedContractAddress, contractSlotE),
        newValue: fr(0x301),
      }),
      expect.objectContaining({
        leafSlot: computePublicDataTreeLeafSlot(nestedContractAddress, contractSlotF),
        newValue: fr(0x351),
      }),
    ]);

    // we keep the non-revertible logs
    expect(arrayNonEmptyLength(outputs.encryptedLogsHashes, l => l.logHash.isEmpty())).toBe(3);
    expect(arrayNonEmptyLength(outputs.unencryptedLogsHashes, l => l.logHash.isEmpty())).toBe(1);
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

    const appLogicFailure = new SimulationError('Simulation Failed in app logic', []);
    const teardownFailure = new SimulationError('Simulation Failed in teardown', []);
    const simulatorResults: PublicExecutionResult[] = [
      // Setup
      PublicExecutionResultBuilder.fromPublicExecutionRequest({
        request: nonRevertibleRequests[0],
      }).build(),

      // App Logic
      PublicExecutionResultBuilder.fromPublicExecutionRequest({
        request: revertibleRequests[0],
        // revert at top-level of enqueued call
        revertReason: appLogicFailure,
      }).build(),

      // Teardown
      PublicExecutionResultBuilder.fromPublicExecutionRequest({
        request: teardownRequest,
        // revert at top-level of enqueued call
        revertReason: teardownFailure,
      }).build(teardownResultSettings),
    ];

    const mockedSimulatorExecutions = [
      // SETUP
      (stateManager: AvmPersistableStateManager) => {
        // mock storage writes on the state manager
        stateManager.writeStorage(nonRevertibleRequests[0].callContext.contractAddress, contractSlotA, fr(0x101));
        stateManager.writeStorage(nestedContractAddress, contractSlotA, fr(0x102));
        stateManager.writeStorage(nestedContractAddress, contractSlotB, fr(0x151));
        return Promise.resolve(simulatorResults[0]);
      },
      // APP LOGIC
      (stateManager: AvmPersistableStateManager) => {
        // mock storage writes on the state manager
        stateManager.writeStorage(revertibleRequests[0].callContext.contractAddress, contractSlotB, fr(0x152));
        stateManager.writeStorage(revertibleRequests[0].callContext.contractAddress, contractSlotC, fr(0x204));
        return Promise.resolve(simulatorResults[1]);
      },
      (stateManager: AvmPersistableStateManager) => {
        // mock storage writes on the state manager
        stateManager.writeStorage(nestedContractAddress, contractSlotC, fr(0x202));
        stateManager.writeStorage(nestedContractAddress, contractSlotC, fr(0x202));
        return Promise.resolve(simulatorResults[2]);
      },
    ];

    for (const executeSimulator of mockedSimulatorExecutions) {
      publicExecutor.simulate.mockImplementationOnce(
        (stateManager: AvmPersistableStateManager): Promise<PublicExecutionResult> => {
          return executeSimulator(stateManager);
        },
      );
    }

    const tailSpy = jest.spyOn(publicKernel, 'publicKernelCircuitTail');

    const txResult = await processor.process(tx);

    expect(txResult.processedPhases).toHaveLength(3);
    expect(txResult.processedPhases[0]).toEqual(expect.objectContaining({ revertReason: undefined }));
    expect(txResult.processedPhases[1]).toEqual(expect.objectContaining({ revertReason: appLogicFailure }));
    expect(txResult.processedPhases[2]).toEqual(expect.objectContaining({ revertReason: teardownFailure }));
    // tx reports app logic failure
    expect(txResult.revertReason).toBe(appLogicFailure);

    expect(tailSpy).toHaveBeenCalledTimes(1);
    expect(publicExecutor.simulate).toHaveBeenCalledTimes(3);

    const outputs = txResult.tailKernelOutput.end;
    const numPublicDataWrites = 3;
    expect(arrayNonEmptyLength(outputs.publicDataUpdateRequests, PublicDataUpdateRequest.isEmpty)).toBe(
      numPublicDataWrites,
    );
    expect(outputs.publicDataUpdateRequests.slice(0, numPublicDataWrites)).toEqual([
      expect.objectContaining({
        leafSlot: computePublicDataTreeLeafSlot(nonRevertibleRequests[0].callContext.contractAddress, contractSlotA),
        newValue: fr(0x101),
      }),
      expect.objectContaining({
        leafSlot: computePublicDataTreeLeafSlot(nestedContractAddress, contractSlotA),
        newValue: fr(0x102),
      }),
      expect.objectContaining({
        leafSlot: computePublicDataTreeLeafSlot(nestedContractAddress, contractSlotB),
        newValue: fr(0x151),
      }),
    ]);

    // we keep the non-revertible logs
    expect(arrayNonEmptyLength(outputs.encryptedLogsHashes, l => l.logHash.isEmpty())).toBe(3);
    expect(arrayNonEmptyLength(outputs.unencryptedLogsHashes, l => l.logHash.isEmpty())).toBe(1);

    expect(txResult.tailKernelOutput.revertCode).toEqual(RevertCode.BOTH_REVERTED);
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

    // Keep gas numbers MAX_L2_GAS_PER_ENQUEUED_CALL or the logic below has to get weird
    const gasLimits = Gas.from({ l2Gas: 1e6, daGas: 1e6 });
    const teardownGas = Gas.from({ l2Gas: 1e5, daGas: 1e5 });
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

    const contractAddress = revertibleRequests[0].callContext.contractAddress;
    const nestedContractAddress = contractAddress; // same contract
    const contractSlotA = fr(0x100);
    const contractSlotB = fr(0x150);
    const contractSlotC = fr(0x200);

    // Keep gas numbers below MAX_L2_GAS_PER_ENQUEUED_CALL or we need
    // to separately compute available start gas and "effective" start gas
    // for each enqueued call after applying that max.
    const initialGas = gasLimits.sub(teardownGas);
    const setupGasUsed = Gas.from({ l2Gas: 1e4 });
    const appGasUsed = Gas.from({ l2Gas: 2e4, daGas: 2e4 });
    const teardownGasUsed = Gas.from({ l2Gas: 3e4, daGas: 3e4 });
    const afterSetupGas = initialGas.sub(setupGasUsed);
    const afterAppGas = afterSetupGas.sub(appGasUsed);
    const afterTeardownGas = teardownGas.sub(teardownGasUsed);

    // Total gas used is the sum of teardown gas allocation plus all expenditures along the way,
    // without including the gas used in the teardown phase (since that's consumed entirely up front).
    const expectedTotalGasUsed = teardownGas.add(setupGasUsed).add(appGasUsed);

    // Inclusion fee plus block gas fees times total gas used
    const expectedTxFee =
      tx.data.constants.txContext.gasSettings.inclusionFee.toNumber() +
      expectedTotalGasUsed.l2Gas * 1 +
      expectedTotalGasUsed.daGas * 1;
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
      }).build({
        startGasLeft: afterSetupGas,
        endGasLeft: afterAppGas,
      }),

      // Teardown
      PublicExecutionResultBuilder.fromPublicExecutionRequest({
        request: teardownRequest,
      }).build({
        startGasLeft: teardownGas,
        endGasLeft: afterTeardownGas,
        transactionFee,
      }),
    ];

    const mockedSimulatorExecutions = [
      // SETUP
      (_stateManager: AvmPersistableStateManager) => {
        // mock storage writes on the state manager
        return Promise.resolve(simulatorResults[0]);
      },
      // APP LOGIC
      async (stateManager: AvmPersistableStateManager) => {
        // mock storage writes on the state manager
        stateManager.writeStorage(revertibleRequests[0].callContext.contractAddress, contractSlotA, fr(0x101));
        stateManager.writeStorage(revertibleRequests[0].callContext.contractAddress, contractSlotB, fr(0x151));
        await stateManager.readStorage(revertibleRequests[0].callContext.contractAddress, contractSlotA);
        return Promise.resolve(simulatorResults[1]);
      },
      async (stateManager: AvmPersistableStateManager) => {
        // mock storage writes on the state manager
        stateManager.writeStorage(nestedContractAddress, contractSlotA, fr(0x103));
        stateManager.writeStorage(nestedContractAddress, contractSlotC, fr(0x201));
        await stateManager.readStorage(nestedContractAddress, contractSlotA);
        stateManager.writeStorage(nestedContractAddress, contractSlotC, fr(0x102));
        stateManager.writeStorage(nestedContractAddress, contractSlotC, fr(0x152));
        await stateManager.readStorage(nestedContractAddress, contractSlotA);
        return Promise.resolve(simulatorResults[2]);
      },
    ];

    for (const executeSimulator of mockedSimulatorExecutions) {
      publicExecutor.simulate.mockImplementationOnce(
        (stateManager: AvmPersistableStateManager): Promise<PublicExecutionResult> => {
          return executeSimulator(stateManager);
        },
      );
    }

    const tailSpy = jest.spyOn(publicKernel, 'publicKernelCircuitTail');

    const txResult = await processor.process(tx);

    expect(txResult.processedPhases).toHaveLength(3);
    expect(txResult.processedPhases[0]).toEqual(expect.objectContaining({ revertReason: undefined }));
    expect(txResult.processedPhases[1]).toEqual(expect.objectContaining({ revertReason: undefined }));
    expect(txResult.processedPhases[2]).toEqual(expect.objectContaining({ revertReason: undefined }));
    expect(txResult.revertReason).toBe(undefined);

    expect(tailSpy).toHaveBeenCalledTimes(1);
    expect(publicExecutor.simulate).toHaveBeenCalledTimes(3);

    const expectedSimulateCall = (availableGas: Partial<FieldsOf<Gas>>, txFee: number) => [
      expect.anything(), // AvmPersistableStateManager
      expect.anything(), // PublicExecution
      expect.anything(), // GlobalVariables
      Gas.from(availableGas),
      expect.anything(), // TxContext
      expect.anything(), // pendingNullifiers
      new Fr(txFee),
    ];

    expect(publicExecutor.simulate).toHaveBeenCalledTimes(3);
    expect(publicExecutor.simulate).toHaveBeenNthCalledWith(1, ...expectedSimulateCall(initialGas, 0));
    expect(publicExecutor.simulate).toHaveBeenNthCalledWith(2, ...expectedSimulateCall(afterSetupGas, 0));
    expect(publicExecutor.simulate).toHaveBeenNthCalledWith(3, ...expectedSimulateCall(teardownGas, expectedTxFee));

    const outputs = txResult.tailKernelOutput.end;
    expect(outputs.gasUsed).toEqual(Gas.from(expectedTotalGasUsed));

    const numPublicDataWrites = 3;
    expect(arrayNonEmptyLength(outputs.publicDataUpdateRequests, PublicDataUpdateRequest.isEmpty)).toBe(
      numPublicDataWrites,
    );
    expect(outputs.publicDataUpdateRequests.slice(0, numPublicDataWrites)).toEqual([
      // squashed
      //expect.objectContaining({ leafSlot: computePublicDataTreeLeafSlot(contractAddress, contractSlotA), newValue: fr(0x101), }),
      expect.objectContaining({
        leafSlot: computePublicDataTreeLeafSlot(contractAddress, contractSlotB),
        newValue: fr(0x151),
      }),
      expect.objectContaining({
        leafSlot: computePublicDataTreeLeafSlot(contractAddress, contractSlotA),
        newValue: fr(0x103),
      }),
      // squashed
      //expect.objectContaining({ leafSlot: computePublicDataTreeLeafSlot(contractAddress, contractSlotC), newValue: fr(0x201), }),
      //expect.objectContaining({ leafSlot: computePublicDataTreeLeafSlot(contractAddress, contractSlotC), newValue: fr(0x102), }),
      expect.objectContaining({
        leafSlot: computePublicDataTreeLeafSlot(contractAddress, contractSlotC),
        newValue: fr(0x152),
      }),
    ]);

    expect(arrayNonEmptyLength(outputs.encryptedLogsHashes, l => l.logHash.isEmpty())).toBe(0);
    expect(arrayNonEmptyLength(outputs.unencryptedLogsHashes, l => l.logHash.isEmpty())).toBe(0);
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

    const txOverhead = 1e4;
    const expectedTxFee = txOverhead + teardownGas.l2Gas * 1 + teardownGas.daGas * 1;
    const transactionFee = new Fr(expectedTxFee);
    const teardownGasUsed = Gas.from({ l2Gas: 1e6, daGas: 1e6 });

    const simulatorResults: PublicExecutionResult[] = [
      // Teardown
      PublicExecutionResultBuilder.fromPublicExecutionRequest({
        request: teardownRequest,
      }).build({
        startGasLeft: teardownGas,
        endGasLeft: teardownGas.sub(teardownGasUsed),
        transactionFee,
      }),
    ];

    publicExecutor.simulate.mockImplementationOnce(() => Promise.resolve(simulatorResults[0]));

    const tailSpy = jest.spyOn(publicKernel, 'publicKernelCircuitTail');

    const txResult = await processor.process(tx);

    expect(txResult.processedPhases).toHaveLength(1);
    expect(txResult.processedPhases[0]).toEqual(expect.objectContaining({ revertReason: undefined }));
    expect(txResult.revertReason).toBe(undefined);

    expect(tailSpy).toHaveBeenCalledTimes(1);
  });
});
