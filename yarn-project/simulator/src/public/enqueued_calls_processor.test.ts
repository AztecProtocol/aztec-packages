import {
  type MerkleTreeWriteOperations,
  SimulationError,
  type TreeInfo,
  TxExecutionPhase,
  mockTx,
} from '@aztec/circuit-types';
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
  PublicDataTreeLeafPreimage,
  PublicDataWrite,
  RevertCode,
  StateReference,
  countAccumulatedItems,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot, siloNullifier } from '@aztec/circuits.js/hash';
import { fr } from '@aztec/circuits.js/testing';
import { openTmpStore } from '@aztec/kv-store/utils';
import { type AppendOnlyTree, Poseidon, StandardTree, newTree } from '@aztec/merkle-tree';

import { type MockProxy, mock } from 'jest-mock-extended';

import { type AvmPersistableStateManager } from '../avm/journal/journal.js';
import { PublicExecutionResultBuilder } from '../mocks/fixtures.js';
import { WASMSimulator } from '../providers/acvm_wasm.js';
import { EnqueuedCallsProcessor } from './enqueued_calls_processor.js';
import { type EnqueuedPublicCallExecutionResult } from './execution.js';
import { type PublicExecutor } from './executor.js';
import { type WorldStateDB } from './public_db_sources.js';
import { RealPublicKernelCircuitSimulator } from './public_kernel.js';
import { type PublicKernelCircuitSimulator } from './public_kernel_circuit_simulator.js';

describe('enqueued_calls_processor', () => {
  // Gas settings.
  const gasFees = GasFees.from({ feePerDaGas: new Fr(2), feePerL2Gas: new Fr(3) });
  const gasLimits = Gas.from({ daGas: 100, l2Gas: 150 });
  const teardownGasLimits = Gas.from({ daGas: 20, l2Gas: 30 });
  const maxFeesPerGas = gasFees;

  // gasUsed for the tx after private execution.
  const txPrivateNonRevertibleGasUsed = Gas.from({ daGas: 13, l2Gas: 17 });
  const txPrivateRevertibleGasUsed = Gas.from({ daGas: 7, l2Gas: 11 });

  // gasUsed for each enqueued call.
  const enqueuedCallGasUsed = new Gas(12, 34);

  let db: MockProxy<MerkleTreeWriteOperations>;
  let publicExecutor: MockProxy<PublicExecutor>;
  let publicKernel: PublicKernelCircuitSimulator;
  let worldStateDB: MockProxy<WorldStateDB>;

  let root: Buffer;
  let publicDataTree: AppendOnlyTree<Fr>;

  let processor: EnqueuedCallsProcessor;

  const mockTxWithPublicCalls = ({
    numberOfSetupCalls = 0,
    numberOfAppLogicCalls = 0,
    hasPublicTeardownCall = false,
  }: {
    numberOfSetupCalls?: number;
    numberOfAppLogicCalls?: number;
    hasPublicTeardownCall?: boolean;
  }) => {
    const tx = mockTx(1, {
      numberOfNonRevertiblePublicCallRequests: numberOfSetupCalls,
      numberOfRevertiblePublicCallRequests: numberOfAppLogicCalls,
      hasPublicTeardownCallRequest: hasPublicTeardownCall,
    });
    tx.data.constants.txContext.gasSettings = GasSettings.from({ gasLimits, teardownGasLimits, maxFeesPerGas });

    tx.data.forPublic!.nonRevertibleAccumulatedData.nullifiers[0] = new Fr(7777);
    tx.data.forPublic!.nonRevertibleAccumulatedData.nullifiers[1] = new Fr(8888);
    tx.data.forPublic!.nonRevertibleAccumulatedData.gasUsed = txPrivateNonRevertibleGasUsed;

    tx.data.forPublic!.revertibleAccumulatedData.nullifiers[0] = new Fr(9999);
    tx.data.forPublic!.revertibleAccumulatedData.gasUsed = txPrivateRevertibleGasUsed;

    return tx;
  };

  const mockPublicExecutor = (
    mockedSimulatorExecutions: ((stateManager: AvmPersistableStateManager) => Promise<PublicExecutionResultBuilder>)[],
  ) => {
    for (const executeSimulator of mockedSimulatorExecutions) {
      publicExecutor.simulate.mockImplementationOnce(
        async (stateManager: AvmPersistableStateManager, _executionResult, _globalVariables, allocatedGas) => {
          const builder = await executeSimulator(stateManager);
          return builder.build({
            endGasLeft: allocatedGas.sub(enqueuedCallGasUsed),
          });
        },
      );
    }
  };

  const expectAvailableGasForCalls = (availableGases: Gas[]) => {
    expect(publicExecutor.simulate).toHaveBeenCalledTimes(availableGases.length);
    availableGases.forEach((availableGas, i) => {
      expect(publicExecutor.simulate).toHaveBeenNthCalledWith(
        i + 1,
        expect.anything(), // AvmPersistableStateManager
        expect.anything(), // publicExecutionRequest
        expect.anything(), // globalVariables
        Gas.from(availableGas),
        expect.anything(), // txFee
      );
    });
  };

  beforeEach(async () => {
    db = mock<MerkleTreeWriteOperations>();
    worldStateDB = mock<WorldStateDB>();
    root = Buffer.alloc(32, 5);

    publicExecutor = mock<PublicExecutor>();
    publicExecutor.simulate.mockImplementation((_stateManager, _executionResult, _globalVariables, allocatedGas) => {
      const result = PublicExecutionResultBuilder.empty().build({
        endGasLeft: allocatedGas.sub(enqueuedCallGasUsed),
      });
      return Promise.resolve(result);
    });

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
      GlobalVariables.from({ ...GlobalVariables.empty(), gasFees }),
      Header.empty(),
      worldStateDB,
      /*realAvmProvingRequest=*/ false,
    );
  });

  it('runs a tx with enqueued public calls in setup phase only', async () => {
    const tx = mockTxWithPublicCalls({
      numberOfSetupCalls: 2,
    });

    const txResult = await processor.process(tx);

    expect(txResult.processedPhases).toEqual([
      expect.objectContaining({ phase: TxExecutionPhase.SETUP, revertReason: undefined }),
    ]);
    expect(txResult.revertCode).toEqual(RevertCode.OK);
    expect(txResult.revertReason).toBe(undefined);

    const expectedPrivateGasUsed = txPrivateNonRevertibleGasUsed.add(txPrivateRevertibleGasUsed);
    const expectedPublicGasUsed = enqueuedCallGasUsed.mul(2); // For 2 setup calls.
    const expectedTotalGas = expectedPrivateGasUsed.add(expectedPublicGasUsed);
    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      teardownGas: Gas.empty(),
    });

    const availableGasForFirstSetup = gasLimits.sub(txPrivateNonRevertibleGasUsed);
    const availableGasForSecondSetup = availableGasForFirstSetup.sub(enqueuedCallGasUsed);
    expectAvailableGasForCalls([availableGasForFirstSetup, availableGasForSecondSetup]);

    const output = txResult.avmProvingRequest!.inputs.output;

    const expectedTxFee = expectedTotalGas.computeFee(gasFees);
    expect(output.transactionFee).toEqual(expectedTxFee);

    // We keep all data.
    expect(countAccumulatedItems(output.accumulatedData.nullifiers)).toBe(3);
  });

  it('runs a tx with enqueued public calls in app logic phase only', async () => {
    const tx = mockTxWithPublicCalls({
      numberOfAppLogicCalls: 2,
    });

    const txResult = await processor.process(tx);

    expect(txResult.processedPhases).toEqual([
      expect.objectContaining({ phase: TxExecutionPhase.APP_LOGIC, revertReason: undefined }),
    ]);
    expect(txResult.revertCode).toEqual(RevertCode.OK);
    expect(txResult.revertReason).toBe(undefined);

    const expectedPrivateGasUsed = txPrivateNonRevertibleGasUsed.add(txPrivateRevertibleGasUsed);
    const expectedPublicGasUsed = enqueuedCallGasUsed.mul(2); // For 2 app logic calls.
    const expectedTotalGas = expectedPrivateGasUsed.add(expectedPublicGasUsed);
    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      teardownGas: Gas.empty(),
    });

    const availableGasForFirstAppLogic = gasLimits.sub(expectedPrivateGasUsed);
    const availableGasForSecondAppLogic = availableGasForFirstAppLogic.sub(enqueuedCallGasUsed);
    expectAvailableGasForCalls([availableGasForFirstAppLogic, availableGasForSecondAppLogic]);

    const output = txResult.avmProvingRequest!.inputs.output;

    const expectedTxFee = expectedTotalGas.computeFee(gasFees);
    expect(output.transactionFee).toEqual(expectedTxFee);

    // We keep all data.
    expect(countAccumulatedItems(output.accumulatedData.nullifiers)).toBe(3);
  });

  it('runs a tx with enqueued public calls in teardown phase only', async () => {
    const tx = mockTxWithPublicCalls({
      hasPublicTeardownCall: true,
    });

    const txResult = await processor.process(tx);

    expect(txResult.processedPhases).toEqual([
      expect.objectContaining({ phase: TxExecutionPhase.TEARDOWN, revertReason: undefined }),
    ]);
    expect(txResult.revertCode).toEqual(RevertCode.OK);
    expect(txResult.revertReason).toBe(undefined);

    const expectedPrivateGasUsed = txPrivateNonRevertibleGasUsed.add(txPrivateRevertibleGasUsed);
    const expectedTeardownGasUsed = enqueuedCallGasUsed;
    const expectedTotalGas = expectedPrivateGasUsed.add(expectedTeardownGasUsed);
    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      teardownGas: expectedTeardownGasUsed,
    });

    expectAvailableGasForCalls([teardownGasLimits]);

    const output = txResult.avmProvingRequest!.inputs.output;

    const expectedTotalGasForFee = expectedTotalGas.sub(expectedTeardownGasUsed).add(teardownGasLimits);
    const expectedTxFee = expectedTotalGasForFee.computeFee(gasFees);
    expect(output.transactionFee).toEqual(expectedTxFee);

    // We keep all data.
    expect(countAccumulatedItems(output.accumulatedData.nullifiers)).toBe(3);
  });

  it('runs a tx with all phases', async () => {
    const tx = mockTxWithPublicCalls({
      numberOfSetupCalls: 2,
      numberOfAppLogicCalls: 1,
      hasPublicTeardownCall: true,
    });

    const txResult = await processor.process(tx);

    expect(txResult.processedPhases).toHaveLength(3);
    expect(txResult.processedPhases).toEqual([
      expect.objectContaining({ phase: TxExecutionPhase.SETUP, revertReason: undefined }),
      expect.objectContaining({ phase: TxExecutionPhase.APP_LOGIC, revertReason: undefined }),
      expect.objectContaining({ phase: TxExecutionPhase.TEARDOWN, revertReason: undefined }),
    ]);
    expect(txResult.revertCode).toEqual(RevertCode.OK);
    expect(txResult.revertReason).toBe(undefined);

    const expectedPrivateGasUsed = txPrivateNonRevertibleGasUsed.add(txPrivateRevertibleGasUsed);
    const expectedPublicGasUsed = enqueuedCallGasUsed.mul(3); // 2 for setup and 1 for app logic.
    const expectedTeardownGasUsed = enqueuedCallGasUsed;
    const expectedTotalGas = expectedPrivateGasUsed.add(expectedPublicGasUsed).add(expectedTeardownGasUsed);
    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      teardownGas: expectedTeardownGasUsed,
    });

    // Check that each enqueued call is allocated the correct amount of gas.
    const availableGasForFirstSetup = gasLimits.sub(teardownGasLimits).sub(txPrivateNonRevertibleGasUsed);
    const availableGasForSecondSetup = availableGasForFirstSetup.sub(enqueuedCallGasUsed);
    const availableGasForAppLogic = availableGasForSecondSetup.sub(txPrivateRevertibleGasUsed).sub(enqueuedCallGasUsed);
    expectAvailableGasForCalls([
      availableGasForFirstSetup,
      availableGasForSecondSetup,
      availableGasForAppLogic,
      teardownGasLimits,
    ]);

    const output = txResult.avmProvingRequest!.inputs.output;

    const expectedTotalGasForFee = expectedTotalGas.sub(expectedTeardownGasUsed).add(teardownGasLimits);
    const expectedTxFee = expectedTotalGasForFee.computeFee(gasFees);
    expect(output.transactionFee).toEqual(expectedTxFee);

    // We keep all data.
    expect(countAccumulatedItems(output.accumulatedData.nullifiers)).toBe(3);
  });

  it('deduplicates public data writes', async function () {
    const tx = mockTxWithPublicCalls({
      numberOfSetupCalls: 1,
      numberOfAppLogicCalls: 1,
      hasPublicTeardownCall: true,
    });

    const revertibleRequests = tx.getRevertiblePublicExecutionRequests();

    const contractAddress = revertibleRequests[0].callContext.contractAddress;
    const contractSlotA = fr(0x100);
    const contractSlotB = fr(0x150);
    const contractSlotC = fr(0x200);

    const mockedSimulatorExecutions = [
      // SETUP
      async (_stateManager: AvmPersistableStateManager) => {
        // Nothing happened in setup phase.
      },
      // APP LOGIC
      async (stateManager: AvmPersistableStateManager) => {
        // mock storage writes on the state manager
        stateManager.writeStorage(contractAddress, contractSlotA, fr(0x101));
        stateManager.writeStorage(contractAddress, contractSlotB, fr(0x151));
        await stateManager.readStorage(contractAddress, contractSlotA);
      },
      async (stateManager: AvmPersistableStateManager) => {
        // mock storage writes on the state manager
        stateManager.writeStorage(contractAddress, contractSlotA, fr(0x103));
        stateManager.writeStorage(contractAddress, contractSlotC, fr(0x201));
        await stateManager.readStorage(contractAddress, contractSlotA);
        stateManager.writeStorage(contractAddress, contractSlotC, fr(0x102));
        stateManager.writeStorage(contractAddress, contractSlotC, fr(0x152));
        await stateManager.readStorage(contractAddress, contractSlotA);
      },
    ];

    for (const executeSimulator of mockedSimulatorExecutions) {
      publicExecutor.simulate.mockImplementationOnce(
        async (
          stateManager: AvmPersistableStateManager,
          _executionResult,
          _globalVariables,
          allocatedGas,
        ): Promise<EnqueuedPublicCallExecutionResult> => {
          await executeSimulator(stateManager);
          const result = PublicExecutionResultBuilder.empty().build({
            endGasLeft: allocatedGas.sub(enqueuedCallGasUsed),
          });
          return Promise.resolve(result);
        },
      );
    }

    const txResult = await processor.process(tx);

    expect(publicExecutor.simulate).toHaveBeenCalledTimes(3);

    const output = txResult.avmProvingRequest!.inputs.output;

    const numPublicDataWrites = 3;
    expect(countAccumulatedItems(output.accumulatedData.publicDataWrites)).toBe(numPublicDataWrites);
    expect(output.accumulatedData.publicDataWrites.slice(0, numPublicDataWrites)).toEqual([
      // squashed
      // new PublicDataWrite(computePublicDataTreeLeafSlot(contractAddress, contractSlotA), fr(0x101)),
      new PublicDataWrite(computePublicDataTreeLeafSlot(contractAddress, contractSlotB), fr(0x151)),
      new PublicDataWrite(computePublicDataTreeLeafSlot(contractAddress, contractSlotA), fr(0x103)),
      // squashed
      // new PublicDataWrite(computePublicDataTreeLeafSlot(contractAddress, contractSlotC), fr(0x201)),
      // new PublicDataWrite(computePublicDataTreeLeafSlot(contractAddress, contractSlotC), fr(0x102)),
      new PublicDataWrite(computePublicDataTreeLeafSlot(contractAddress, contractSlotC), fr(0x152)),
    ]);
  });

  it('fails a transaction that reverts in setup', async function () {
    const tx = mockTx(1, {
      numberOfNonRevertiblePublicCallRequests: 1,
      numberOfRevertiblePublicCallRequests: 1,
      hasPublicTeardownCallRequest: true,
    });

    const setupFailureMsg = 'Simulation Failed in setup';
    const setupFailure = new SimulationError(setupFailureMsg, []);
    publicExecutor.simulate.mockResolvedValueOnce(
      PublicExecutionResultBuilder.empty().withReverted(setupFailure).build(),
    );

    await expect(processor.process(tx)).rejects.toThrow(setupFailureMsg);

    expect(publicExecutor.simulate).toHaveBeenCalledTimes(1);
  });

  it('includes a transaction that reverts in app logic', async function () {
    const tx = mockTxWithPublicCalls({
      numberOfSetupCalls: 1,
      numberOfAppLogicCalls: 1,
      hasPublicTeardownCall: true,
    });

    const appLogicFailure = new SimulationError('Simulation Failed in app logic', []);

    const contractAddress = AztecAddress.fromBigInt(112233n);
    mockPublicExecutor([
      // SETUP
      async (stateManager: AvmPersistableStateManager) => {
        // mock nullifiers on the state manager
        await stateManager.writeNullifier(contractAddress, new Fr(1));
        return PublicExecutionResultBuilder.empty();
      },
      // APP LOGIC
      async (stateManager: AvmPersistableStateManager) => {
        // mock nullifiers the state manager
        await stateManager.writeNullifier(contractAddress, new Fr(2));
        await stateManager.writeNullifier(contractAddress, new Fr(3));
        return PublicExecutionResultBuilder.empty().withReverted(appLogicFailure);
      },
      async (stateManager: AvmPersistableStateManager) => {
        // mock nullifiers the state manager
        await stateManager.writeNullifier(contractAddress, new Fr(4));
        return PublicExecutionResultBuilder.empty();
      },
    ]);

    const txResult = await processor.process(tx);

    expect(txResult.processedPhases).toHaveLength(3);
    expect(txResult.processedPhases).toEqual([
      expect.objectContaining({ phase: TxExecutionPhase.SETUP, revertReason: undefined }),
      expect.objectContaining({ phase: TxExecutionPhase.APP_LOGIC, revertReason: appLogicFailure }),
      expect.objectContaining({ phase: TxExecutionPhase.TEARDOWN, revertReason: undefined }),
    ]);
    expect(txResult.revertCode).toEqual(RevertCode.APP_LOGIC_REVERTED);
    // tx reports app logic failure
    expect(txResult.revertReason).toBe(appLogicFailure);

    const expectedSetupGas = txPrivateNonRevertibleGasUsed.add(enqueuedCallGasUsed);
    const { l2Gas: appLogicL2Gas } = txPrivateRevertibleGasUsed.add(enqueuedCallGasUsed);
    // All data emitted from app logic were discarded. daGas set to 0.
    const expectedAppLogicGas = Gas.from({ daGas: 0, l2Gas: appLogicL2Gas });
    const expectedTeardownGasUsed = enqueuedCallGasUsed;
    const expectedTotalGas = expectedSetupGas.add(expectedAppLogicGas).add(expectedTeardownGasUsed);
    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      teardownGas: expectedTeardownGasUsed,
    });

    const availableGasForSetup = gasLimits.sub(teardownGasLimits).sub(txPrivateNonRevertibleGasUsed);
    const allocatedAppLogicGas = availableGasForSetup.sub(txPrivateRevertibleGasUsed).sub(enqueuedCallGasUsed);
    expectAvailableGasForCalls([availableGasForSetup, allocatedAppLogicGas, teardownGasLimits]);

    const output = txResult.avmProvingRequest!.inputs.output;

    const expectedTotalGasForFee = expectedTotalGas.sub(expectedTeardownGasUsed).add(teardownGasLimits);
    const expectedTxFee = expectedTotalGasForFee.computeFee(gasFees);
    expect(output.transactionFee).toEqual(expectedTxFee);

    // we keep the non-revertible data.
    expect(countAccumulatedItems(output.accumulatedData.nullifiers)).toBe(4);
    expect(output.accumulatedData.nullifiers.slice(0, 4)).toEqual([
      new Fr(7777),
      new Fr(8888),
      siloNullifier(contractAddress, new Fr(1)),
      siloNullifier(contractAddress, new Fr(4)),
    ]);
  });

  it('includes a transaction that reverts in teardown', async function () {
    const tx = mockTxWithPublicCalls({
      numberOfSetupCalls: 1,
      numberOfAppLogicCalls: 1,
      hasPublicTeardownCall: true,
    });

    const teardownFailure = new SimulationError('Simulation Failed in teardown', []);

    const contractAddress = AztecAddress.fromBigInt(112233n);
    mockPublicExecutor([
      // SETUP
      async (stateManager: AvmPersistableStateManager) => {
        // mock nullifiers on the state manager
        await stateManager.writeNullifier(contractAddress, new Fr(1));
        return PublicExecutionResultBuilder.empty();
      },
      // APP LOGIC
      async (stateManager: AvmPersistableStateManager) => {
        // mock nullifiers on the state manager
        await stateManager.writeNullifier(contractAddress, new Fr(2));
        await stateManager.writeNullifier(contractAddress, new Fr(3));
        return PublicExecutionResultBuilder.empty();
      },
      async (stateManager: AvmPersistableStateManager) => {
        // mock nullifiers on the state manager
        await stateManager.writeNullifier(contractAddress, new Fr(4));
        return PublicExecutionResultBuilder.empty().withReverted(teardownFailure);
      },
    ]);

    const txResult = await processor.process(tx);

    expect(txResult.processedPhases).toEqual([
      expect.objectContaining({ phase: TxExecutionPhase.SETUP, revertReason: undefined }),
      expect.objectContaining({ phase: TxExecutionPhase.APP_LOGIC, revertReason: undefined }),
      expect.objectContaining({ phase: TxExecutionPhase.TEARDOWN, revertReason: teardownFailure }),
    ]);
    expect(txResult.revertCode).toEqual(RevertCode.TEARDOWN_REVERTED);
    expect(txResult.revertReason).toBe(teardownFailure);

    const expectedSetupGas = txPrivateNonRevertibleGasUsed.add(enqueuedCallGasUsed);
    const expectedAppLogicGas = txPrivateRevertibleGasUsed.add(enqueuedCallGasUsed);
    const { l2Gas: teardownL2Gas } = enqueuedCallGasUsed;
    // All data emitted from teardown were discarded. daGas set to 0.
    const expectedTeardownGasUsed = Gas.from({ daGas: 0, l2Gas: teardownL2Gas });
    const expectedTotalGas = expectedSetupGas.add(expectedAppLogicGas).add(expectedTeardownGasUsed);
    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      teardownGas: expectedTeardownGasUsed,
    });

    const availableGasForSetup = gasLimits.sub(teardownGasLimits).sub(txPrivateNonRevertibleGasUsed);
    const allocatedAppLogicGas = availableGasForSetup.sub(txPrivateRevertibleGasUsed).sub(enqueuedCallGasUsed);
    expectAvailableGasForCalls([availableGasForSetup, allocatedAppLogicGas, teardownGasLimits]);

    const output = txResult.avmProvingRequest!.inputs.output;

    // Should still charge the full teardownGasLimits for fee even though teardown reverted.
    const expectedTotalGasForFee = expectedTotalGas.sub(expectedTeardownGasUsed).add(teardownGasLimits);
    const expectedTxFee = expectedTotalGasForFee.computeFee(gasFees);
    expect(output.transactionFee).toEqual(expectedTxFee);

    // We keep the non-revertible data.
    expect(countAccumulatedItems(output.accumulatedData.nullifiers)).toBe(3);
    expect(output.accumulatedData.nullifiers.slice(0, 3)).toEqual([
      new Fr(7777),
      new Fr(8888),
      // new Fr(9999), // TODO: Data in app logic should be kept if teardown reverts.
      siloNullifier(contractAddress, new Fr(1)),
      // siloNullifier(contractAddress, new Fr(2)),
      // siloNullifier(contractAddress, new Fr(2)),
    ]);
  });

  it('includes a transaction that reverts in app logic and teardown', async function () {
    const tx = mockTxWithPublicCalls({
      numberOfSetupCalls: 1,
      numberOfAppLogicCalls: 1,
      hasPublicTeardownCall: true,
    });

    const appLogicFailure = new SimulationError('Simulation Failed in app logic', []);
    const teardownFailure = new SimulationError('Simulation Failed in teardown', []);
    const contractAddress = AztecAddress.fromBigInt(112233n);
    mockPublicExecutor([
      // SETUP
      async (stateManager: AvmPersistableStateManager) => {
        // mock nullifiers on the state manager
        await stateManager.writeNullifier(contractAddress, new Fr(1));
        return PublicExecutionResultBuilder.empty();
      },
      // APP LOGIC
      async (stateManager: AvmPersistableStateManager) => {
        // mock nullifiers on the state manager
        await stateManager.writeNullifier(contractAddress, new Fr(2));
        await stateManager.writeNullifier(contractAddress, new Fr(3));
        return PublicExecutionResultBuilder.empty().withReverted(appLogicFailure);
      },
      async (stateManager: AvmPersistableStateManager) => {
        // mock nullifiers on the state manager
        await stateManager.writeNullifier(contractAddress, new Fr(4));
        return PublicExecutionResultBuilder.empty().withReverted(teardownFailure);
      },
    ]);

    const txResult = await processor.process(tx);

    expect(txResult.processedPhases).toHaveLength(3);
    expect(txResult.processedPhases).toEqual([
      expect.objectContaining({ phase: TxExecutionPhase.SETUP, revertReason: undefined }),
      expect.objectContaining({ phase: TxExecutionPhase.APP_LOGIC, revertReason: appLogicFailure }),
      expect.objectContaining({ phase: TxExecutionPhase.TEARDOWN, revertReason: teardownFailure }),
    ]);
    expect(txResult.revertCode).toEqual(RevertCode.BOTH_REVERTED);
    // tx reports app logic failure
    expect(txResult.revertReason).toBe(appLogicFailure);

    const expectedSetupGas = txPrivateNonRevertibleGasUsed.add(enqueuedCallGasUsed);
    const { l2Gas: appLogicL2Gas } = txPrivateRevertibleGasUsed.add(enqueuedCallGasUsed);
    // All data emitted from app logic were discarded. daGas set to 0.
    const expectedAppLogicGas = Gas.from({ daGas: 0, l2Gas: appLogicL2Gas });
    const { l2Gas: teardownL2Gas } = enqueuedCallGasUsed;
    // All data emitted from teardown were discarded. daGas set to 0.
    const expectedTeardownGasUsed = Gas.from({ daGas: 0, l2Gas: teardownL2Gas });
    const expectedTotalGas = expectedSetupGas.add(expectedAppLogicGas).add(expectedTeardownGasUsed);
    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      teardownGas: expectedTeardownGasUsed,
    });

    const availableGasForSetup = gasLimits.sub(teardownGasLimits).sub(txPrivateNonRevertibleGasUsed);
    const allocatedAppLogicGas = availableGasForSetup.sub(txPrivateRevertibleGasUsed).sub(enqueuedCallGasUsed);
    expectAvailableGasForCalls([availableGasForSetup, allocatedAppLogicGas, teardownGasLimits]);

    const output = txResult.avmProvingRequest!.inputs.output;

    // Should still charge the full teardownGasLimits for fee even though teardown reverted.
    const expectedTotalGasForFee = expectedTotalGas.sub(expectedTeardownGasUsed).add(teardownGasLimits);
    const expectedTxFee = expectedTotalGasForFee.computeFee(gasFees);
    expect(output.transactionFee).toEqual(expectedTxFee);

    // we keep the non-revertible data
    expect(countAccumulatedItems(output.accumulatedData.nullifiers)).toBe(3);
    expect(output.accumulatedData.nullifiers.slice(0, 3)).toEqual([
      new Fr(7777),
      new Fr(8888),
      siloNullifier(contractAddress, new Fr(1)),
    ]);
  });
});
