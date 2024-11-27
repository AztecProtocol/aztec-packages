import { type MerkleTreeWriteOperations, SimulationError, TxExecutionPhase, mockTx } from '@aztec/circuit-types';
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
  PublicDataWrite,
  RevertCode,
  StateReference,
  countAccumulatedItems,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot, siloNullifier } from '@aztec/circuits.js/hash';
import { fr } from '@aztec/circuits.js/testing';
import { type AztecKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/utils';
import { type AppendOnlyTree, Poseidon, StandardTree, newTree } from '@aztec/merkle-tree';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { MerkleTrees } from '@aztec/world-state';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { AvmFinalizedCallResult } from '../avm/avm_contract_call_result.js';
import { type AvmPersistableStateManager } from '../avm/journal/journal.js';
import { type InstructionSet } from '../avm/serialization/bytecode_serialization.js';
import { type WorldStateDB } from './public_db_sources.js';
import { PublicTxSimulator } from './public_tx_simulator.js';

describe('public_tx_simulator', () => {
  // Gas settings.
  const gasFees = GasFees.from({ feePerDaGas: new Fr(2), feePerL2Gas: new Fr(3) });
  const gasLimits = Gas.from({ daGas: 100, l2Gas: 150 });
  const teardownGasLimits = Gas.from({ daGas: 20, l2Gas: 30 });
  const maxFeesPerGas = gasFees;

  // gasUsed for the tx after private execution, minus the teardownGasLimits.
  const privateGasUsed = Gas.from({ daGas: 13, l2Gas: 17 });

  // gasUsed for each enqueued call.
  const enqueuedCallGasUsed = new Gas(12, 34);

  let db: MerkleTreeWriteOperations;
  let worldStateDB: MockProxy<WorldStateDB>;

  let publicDataTree: AppendOnlyTree<Fr>;

  let treeStore: AztecKVStore;
  let simulator: PublicTxSimulator;
  let simulateInternal: jest.SpiedFunction<
    (
      stateManager: AvmPersistableStateManager,
      executionResult: any,
      allocatedGas: Gas,
      transactionFee: any,
      fnName: any,
      instructionSet: InstructionSet,
    ) => Promise<AvmFinalizedCallResult>
  >;

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

    tx.data.forPublic!.revertibleAccumulatedData.nullifiers[0] = new Fr(9999);

    tx.data.gasUsed = privateGasUsed;
    if (hasPublicTeardownCall) {
      tx.data.gasUsed = tx.data.gasUsed.add(teardownGasLimits);
    }

    return tx;
  };

  const mockPublicExecutor = (
    mockedSimulatorExecutions: ((stateManager: AvmPersistableStateManager) => Promise<SimulationError | void>)[],
  ) => {
    for (const executeSimulator of mockedSimulatorExecutions) {
      simulateInternal.mockImplementationOnce(
        async (
          stateManager: AvmPersistableStateManager,
          _executionResult: any,
          allocatedGas: Gas,
          _transactionFee: any,
          _fnName: any,
        ) => {
          const revertReason = await executeSimulator(stateManager);
          if (revertReason === undefined) {
            return Promise.resolve(
              new AvmFinalizedCallResult(
                /*reverted=*/ false,
                /*output=*/ [],
                /*gasLeft=*/ allocatedGas.sub(enqueuedCallGasUsed),
              ),
            );
          } else {
            return Promise.resolve(
              new AvmFinalizedCallResult(
                /*reverted=*/ true,
                /*output=*/ [],
                /*gasLeft=*/ allocatedGas.sub(enqueuedCallGasUsed),
                revertReason,
              ),
            );
          }
        },
      );
    }
  };

  const expectAvailableGasForCalls = (availableGases: Gas[]) => {
    expect(simulateInternal).toHaveBeenCalledTimes(availableGases.length);
    availableGases.forEach((availableGas, i) => {
      expect(simulateInternal).toHaveBeenNthCalledWith(
        i + 1,
        expect.anything(), // AvmPersistableStateManager
        expect.anything(), // publicExecutionRequest
        Gas.from(availableGas),
        expect.anything(), // txFee
        expect.anything(), // fnName
      );
    });
  };

  beforeEach(async () => {
    const tmp = openTmpStore();
    const telemetryClient = new NoopTelemetryClient();
    db = await (await MerkleTrees.new(tmp, telemetryClient)).fork();
    worldStateDB = mock<WorldStateDB>();

    treeStore = openTmpStore();

    publicDataTree = await newTree(
      StandardTree,
      treeStore,
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

    worldStateDB.getMerkleInterface.mockReturnValue(db);

    simulator = new PublicTxSimulator(
      db,
      worldStateDB,
      new NoopTelemetryClient(),
      GlobalVariables.from({ ...GlobalVariables.empty(), gasFees }),
      /*realAvmProvingRequest=*/ false,
    );

    // Mock the internal private function. Borrowed from https://stackoverflow.com/a/71033167
    simulateInternal = jest.spyOn(
      simulator as unknown as { simulateEnqueuedCallInternal: PublicTxSimulator['simulateEnqueuedCallInternal'] },
      'simulateEnqueuedCallInternal',
    );
    simulateInternal.mockImplementation(
      (
        _stateManager: AvmPersistableStateManager,
        _executionResult: any,
        allocatedGas: Gas,
        _transactionFee: any,
        _fnName: any,
      ) => {
        return Promise.resolve(
          new AvmFinalizedCallResult(
            /*reverted=*/ false,
            /*output=*/ [],
            /*gasLeft=*/ allocatedGas.sub(enqueuedCallGasUsed),
            /*revertReason=*/ undefined,
          ),
        );
      },
    );
  }, 30_000);

  afterEach(async () => {
    await treeStore.delete();
  });

  it('runs a tx with enqueued public calls in setup phase only', async () => {
    const tx = mockTxWithPublicCalls({
      numberOfSetupCalls: 2,
    });

    const txResult = await simulator.simulate(tx);

    expect(txResult.processedPhases).toEqual([
      expect.objectContaining({ phase: TxExecutionPhase.SETUP, revertReason: undefined }),
    ]);
    expect(txResult.revertCode).toEqual(RevertCode.OK);
    expect(txResult.revertReason).toBe(undefined);

    const expectedPublicGasUsed = enqueuedCallGasUsed.mul(2); // For 2 setup calls.
    const expectedTotalGas = privateGasUsed.add(expectedPublicGasUsed);
    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      teardownGas: Gas.empty(),
    });

    const availableGasForFirstSetup = gasLimits.sub(privateGasUsed);
    const availableGasForSecondSetup = availableGasForFirstSetup.sub(enqueuedCallGasUsed);
    expectAvailableGasForCalls([availableGasForFirstSetup, availableGasForSecondSetup]);

    const output = txResult.avmProvingRequest!.inputs.output;

    const expectedGasUsedForFee = expectedTotalGas;
    const expectedTxFee = expectedTotalGas.computeFee(gasFees);
    expect(output.endGasUsed).toEqual(expectedGasUsedForFee);
    expect(output.transactionFee).toEqual(expectedTxFee);

    // We keep all data.
    expect(countAccumulatedItems(output.accumulatedData.nullifiers)).toBe(3);
  });

  it('runs a tx with enqueued public calls in app logic phase only', async () => {
    const tx = mockTxWithPublicCalls({
      numberOfAppLogicCalls: 2,
    });

    const txResult = await simulator.simulate(tx);

    expect(txResult.processedPhases).toEqual([
      expect.objectContaining({ phase: TxExecutionPhase.APP_LOGIC, revertReason: undefined }),
    ]);
    expect(txResult.revertCode).toEqual(RevertCode.OK);
    expect(txResult.revertReason).toBe(undefined);

    const expectedPublicGasUsed = enqueuedCallGasUsed.mul(2); // For 2 app logic calls.
    const expectedTotalGas = privateGasUsed.add(expectedPublicGasUsed);
    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      teardownGas: Gas.empty(),
    });

    const availableGasForFirstAppLogic = gasLimits.sub(privateGasUsed);
    const availableGasForSecondAppLogic = availableGasForFirstAppLogic.sub(enqueuedCallGasUsed);
    expectAvailableGasForCalls([availableGasForFirstAppLogic, availableGasForSecondAppLogic]);

    const output = txResult.avmProvingRequest!.inputs.output;

    const expectedGasUsedForFee = expectedTotalGas;
    const expectedTxFee = expectedTotalGas.computeFee(gasFees);
    expect(output.endGasUsed).toEqual(expectedGasUsedForFee);
    expect(output.transactionFee).toEqual(expectedTxFee);

    // We keep all data.
    expect(countAccumulatedItems(output.accumulatedData.nullifiers)).toBe(3);
  });

  it('runs a tx with enqueued public calls in teardown phase only', async () => {
    const tx = mockTxWithPublicCalls({
      hasPublicTeardownCall: true,
    });

    const txResult = await simulator.simulate(tx);

    expect(txResult.processedPhases).toEqual([
      expect.objectContaining({ phase: TxExecutionPhase.TEARDOWN, revertReason: undefined }),
    ]);
    expect(txResult.revertCode).toEqual(RevertCode.OK);
    expect(txResult.revertReason).toBe(undefined);

    const expectedTeardownGasUsed = enqueuedCallGasUsed;
    const expectedTotalGas = privateGasUsed.add(expectedTeardownGasUsed);
    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      teardownGas: expectedTeardownGasUsed,
    });

    expectAvailableGasForCalls([teardownGasLimits]);

    const output = txResult.avmProvingRequest!.inputs.output;

    const expectedGasUsedForFee = expectedTotalGas.sub(expectedTeardownGasUsed).add(teardownGasLimits);
    const expectedTxFee = expectedGasUsedForFee.computeFee(gasFees);
    expect(output.endGasUsed).toEqual(expectedGasUsedForFee);
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

    const txResult = await simulator.simulate(tx);

    expect(txResult.processedPhases).toHaveLength(3);
    expect(txResult.processedPhases).toEqual([
      expect.objectContaining({ phase: TxExecutionPhase.SETUP, revertReason: undefined }),
      expect.objectContaining({ phase: TxExecutionPhase.APP_LOGIC, revertReason: undefined }),
      expect.objectContaining({ phase: TxExecutionPhase.TEARDOWN, revertReason: undefined }),
    ]);
    expect(txResult.revertCode).toEqual(RevertCode.OK);
    expect(txResult.revertReason).toBe(undefined);

    const expectedPublicGasUsed = enqueuedCallGasUsed.mul(3); // 2 for setup and 1 for app logic.
    const expectedTeardownGasUsed = enqueuedCallGasUsed;
    const expectedTotalGas = privateGasUsed.add(expectedPublicGasUsed).add(expectedTeardownGasUsed);
    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      teardownGas: expectedTeardownGasUsed,
    });

    // Check that each enqueued call is allocated the correct amount of gas.
    const availableGasForFirstSetup = gasLimits.sub(teardownGasLimits).sub(privateGasUsed);
    const availableGasForSecondSetup = availableGasForFirstSetup.sub(enqueuedCallGasUsed);
    const availableGasForAppLogic = availableGasForSecondSetup.sub(enqueuedCallGasUsed);
    expectAvailableGasForCalls([
      availableGasForFirstSetup,
      availableGasForSecondSetup,
      availableGasForAppLogic,
      teardownGasLimits,
    ]);

    const output = txResult.avmProvingRequest!.inputs.output;

    const expectedGasUsedForFee = expectedTotalGas.sub(expectedTeardownGasUsed).add(teardownGasLimits);
    const expectedTxFee = expectedGasUsedForFee.computeFee(gasFees);
    expect(output.endGasUsed).toEqual(expectedGasUsedForFee);
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

    mockPublicExecutor([
      // SETUP
      async (_stateManager: AvmPersistableStateManager) => {
        // Nothing happened in setup phase.
      },
      // APP LOGIC
      async (stateManager: AvmPersistableStateManager) => {
        // mock storage writes on the state manager
        await stateManager.writeStorage(contractAddress, contractSlotA, fr(0x101));
        await stateManager.writeStorage(contractAddress, contractSlotB, fr(0x151));
        await stateManager.readStorage(contractAddress, contractSlotA);
      },
      async (stateManager: AvmPersistableStateManager) => {
        // mock storage writes on the state manager
        await stateManager.writeStorage(contractAddress, contractSlotA, fr(0x103));
        await stateManager.writeStorage(contractAddress, contractSlotC, fr(0x201));
        await stateManager.readStorage(contractAddress, contractSlotA);
        await stateManager.writeStorage(contractAddress, contractSlotC, fr(0x102));
        await stateManager.writeStorage(contractAddress, contractSlotC, fr(0x152));
        await stateManager.readStorage(contractAddress, contractSlotA);
      },
    ]);

    const txResult = await simulator.simulate(tx);

    expect(simulateInternal).toHaveBeenCalledTimes(3);

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
    simulateInternal.mockResolvedValueOnce(
      new AvmFinalizedCallResult(
        /*reverted=*/ true,
        /*output=*/ [],
        /*gasLeft=*/ Gas.empty(),
        /*revertReason=*/ setupFailure,
      ),
    );

    await expect(simulator.simulate(tx)).rejects.toThrow(setupFailureMsg);

    expect(simulateInternal).toHaveBeenCalledTimes(1);
  });

  it('includes a transaction that reverts in app logic only', async function () {
    const tx = mockTxWithPublicCalls({
      numberOfSetupCalls: 1,
      numberOfAppLogicCalls: 2,
      hasPublicTeardownCall: true,
    });

    const appLogicFailure = new SimulationError('Simulation Failed in app logic', []);

    const contractAddress = AztecAddress.fromBigInt(112233n);
    mockPublicExecutor([
      // SETUP
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeNullifier(contractAddress, new Fr(1));
      },
      // APP LOGIC
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeNullifier(contractAddress, new Fr(2));
        await stateManager.writeNullifier(contractAddress, new Fr(3));
      },
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeNullifier(contractAddress, new Fr(4));
        return Promise.resolve(appLogicFailure);
      },
      // TEARDOWN
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeNullifier(contractAddress, new Fr(5));
      },
    ]);

    const txResult = await simulator.simulate(tx);

    expect(txResult.processedPhases).toHaveLength(3);
    expect(txResult.processedPhases).toEqual([
      expect.objectContaining({ phase: TxExecutionPhase.SETUP, revertReason: undefined }),
      expect.objectContaining({ phase: TxExecutionPhase.APP_LOGIC, revertReason: appLogicFailure }),
      expect.objectContaining({ phase: TxExecutionPhase.TEARDOWN, revertReason: undefined }),
    ]);
    expect(txResult.revertCode).toEqual(RevertCode.APP_LOGIC_REVERTED);
    // tx reports app logic failure
    expect(txResult.revertReason).toBe(appLogicFailure);

    const expectedSetupGas = enqueuedCallGasUsed;
    const expectedAppLogicGas = enqueuedCallGasUsed.mul(2);
    const expectedTeardownGasUsed = enqueuedCallGasUsed;
    const expectedTotalGas = privateGasUsed.add(expectedSetupGas).add(expectedAppLogicGas).add(expectedTeardownGasUsed);
    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      teardownGas: expectedTeardownGasUsed,
    });

    const availableGasForSetup = gasLimits.sub(teardownGasLimits).sub(privateGasUsed);
    const availableGasForFirstAppLogic = availableGasForSetup.sub(enqueuedCallGasUsed);
    const availableGasForSecondAppLogic = availableGasForFirstAppLogic.sub(enqueuedCallGasUsed);
    expectAvailableGasForCalls([
      availableGasForSetup,
      availableGasForFirstAppLogic,
      availableGasForSecondAppLogic,
      teardownGasLimits,
    ]);

    const output = txResult.avmProvingRequest!.inputs.output;

    const expectedGasUsedForFee = expectedTotalGas.sub(expectedTeardownGasUsed).add(teardownGasLimits);
    const expectedTxFee = expectedGasUsedForFee.computeFee(gasFees);
    expect(output.endGasUsed).toEqual(expectedGasUsedForFee);
    expect(output.transactionFee).toEqual(expectedTxFee);

    // we keep the non-revertible data.
    expect(countAccumulatedItems(output.accumulatedData.nullifiers)).toBe(4);
    expect(output.accumulatedData.nullifiers.slice(0, 4)).toEqual([
      new Fr(7777),
      new Fr(8888),
      siloNullifier(contractAddress, new Fr(1)),
      siloNullifier(contractAddress, new Fr(5)),
    ]);
  });

  it('includes a transaction that reverts in teardown only', async function () {
    const tx = mockTxWithPublicCalls({
      numberOfSetupCalls: 1,
      numberOfAppLogicCalls: 2,
      hasPublicTeardownCall: true,
    });

    const teardownFailure = new SimulationError('Simulation Failed in teardown', []);

    const contractAddress = AztecAddress.fromBigInt(112233n);
    mockPublicExecutor([
      // SETUP
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeNullifier(contractAddress, new Fr(1));
      },
      // APP LOGIC
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeNullifier(contractAddress, new Fr(2));
        await stateManager.writeNullifier(contractAddress, new Fr(3));
      },
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeNullifier(contractAddress, new Fr(4));
      },
      // TEARDOWN
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeNullifier(contractAddress, new Fr(5));
        return Promise.resolve(teardownFailure);
      },
    ]);

    const txResult = await simulator.simulate(tx);

    expect(txResult.processedPhases).toEqual([
      expect.objectContaining({ phase: TxExecutionPhase.SETUP, revertReason: undefined }),
      expect.objectContaining({ phase: TxExecutionPhase.APP_LOGIC, revertReason: undefined }),
      expect.objectContaining({ phase: TxExecutionPhase.TEARDOWN, revertReason: teardownFailure }),
    ]);
    expect(txResult.revertCode).toEqual(RevertCode.TEARDOWN_REVERTED);
    expect(txResult.revertReason).toBe(teardownFailure);

    const expectedSetupGas = enqueuedCallGasUsed;
    const expectedAppLogicGas = enqueuedCallGasUsed.mul(2);
    const expectedTeardownGasUsed = enqueuedCallGasUsed;
    const expectedTotalGas = privateGasUsed.add(expectedSetupGas).add(expectedAppLogicGas).add(expectedTeardownGasUsed);
    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      teardownGas: expectedTeardownGasUsed,
    });

    const availableGasForSetup = gasLimits.sub(teardownGasLimits).sub(privateGasUsed);
    const availableGasForFirstAppLogic = availableGasForSetup.sub(enqueuedCallGasUsed);
    const availableGasForSecondAppLogic = availableGasForFirstAppLogic.sub(enqueuedCallGasUsed);
    expectAvailableGasForCalls([
      availableGasForSetup,
      availableGasForFirstAppLogic,
      availableGasForSecondAppLogic,
      teardownGasLimits,
    ]);

    const output = txResult.avmProvingRequest!.inputs.output;

    // Should still charge the full teardownGasLimits for fee even though teardown reverted.
    const expectedGasUsedForFee = expectedTotalGas.sub(expectedTeardownGasUsed).add(teardownGasLimits);
    const expectedTxFee = expectedGasUsedForFee.computeFee(gasFees);
    expect(output.endGasUsed).toEqual(expectedGasUsedForFee);
    expect(output.transactionFee).toEqual(expectedTxFee);

    // We keep the non-revertible data.
    expect(countAccumulatedItems(output.accumulatedData.nullifiers)).toBe(3);
    expect(output.accumulatedData.nullifiers.slice(0, 3)).toEqual([
      new Fr(7777),
      new Fr(8888),
      // new Fr(9999), // TODO: Data in app logic should be kept if teardown reverts.
      siloNullifier(contractAddress, new Fr(1)),
      // siloNullifier(contractAddress, new Fr(2)),
      // siloNullifier(contractAddress, new Fr(3)),
      // siloNullifier(contractAddress, new Fr(4)),
      // siloNullifier(contractAddress, new Fr(5)),
    ]);
  });

  it('includes a transaction that reverts in app logic and teardown', async function () {
    const tx = mockTxWithPublicCalls({
      numberOfSetupCalls: 1,
      numberOfAppLogicCalls: 2,
      hasPublicTeardownCall: true,
    });

    const appLogicFailure = new SimulationError('Simulation Failed in app logic', []);
    const teardownFailure = new SimulationError('Simulation Failed in teardown', []);
    const contractAddress = AztecAddress.fromBigInt(112233n);
    mockPublicExecutor([
      // SETUP
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeNullifier(contractAddress, new Fr(1));
      },
      // APP LOGIC
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeNullifier(contractAddress, new Fr(2));
        await stateManager.writeNullifier(contractAddress, new Fr(3));
      },
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeNullifier(contractAddress, new Fr(4));
        return Promise.resolve(appLogicFailure);
      },
      // TEARDOWN
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeNullifier(contractAddress, new Fr(5));
        return Promise.resolve(teardownFailure);
      },
    ]);

    const txResult = await simulator.simulate(tx);

    expect(txResult.processedPhases).toHaveLength(3);
    expect(txResult.processedPhases).toEqual([
      expect.objectContaining({ phase: TxExecutionPhase.SETUP, revertReason: undefined }),
      expect.objectContaining({ phase: TxExecutionPhase.APP_LOGIC, revertReason: appLogicFailure }),
      expect.objectContaining({ phase: TxExecutionPhase.TEARDOWN, revertReason: teardownFailure }),
    ]);
    expect(txResult.revertCode).toEqual(RevertCode.BOTH_REVERTED);
    // tx reports app logic failure
    expect(txResult.revertReason).toBe(appLogicFailure);

    const expectedSetupGas = enqueuedCallGasUsed;
    const expectedAppLogicGas = enqueuedCallGasUsed.mul(2);
    const expectedTeardownGasUsed = enqueuedCallGasUsed;
    const expectedTotalGas = privateGasUsed.add(expectedSetupGas).add(expectedAppLogicGas).add(expectedTeardownGasUsed);
    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      teardownGas: expectedTeardownGasUsed,
    });

    const availableGasForSetup = gasLimits.sub(teardownGasLimits).sub(privateGasUsed);
    const availableGasForFirstAppLogic = availableGasForSetup.sub(enqueuedCallGasUsed);
    const availableGasForSecondAppLogic = availableGasForFirstAppLogic.sub(enqueuedCallGasUsed);
    expectAvailableGasForCalls([
      availableGasForSetup,
      availableGasForFirstAppLogic,
      availableGasForSecondAppLogic,
      teardownGasLimits,
    ]);

    const output = txResult.avmProvingRequest!.inputs.output;

    // Should still charge the full teardownGasLimits for fee even though teardown reverted.
    const expectedGasUsedForFee = expectedTotalGas.sub(expectedTeardownGasUsed).add(teardownGasLimits);
    const expectedTxFee = expectedGasUsedForFee.computeFee(gasFees);
    expect(output.endGasUsed).toEqual(expectedGasUsedForFee);
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
