import {
  MerkleTreeId,
  type MerkleTreeWriteOperations,
  SimulationError,
  TxExecutionPhase,
  mockTx,
} from '@aztec/circuit-types';
import {
  AppendOnlyTreeSnapshot,
  AztecAddress,
  BlockHeader,
  type ContractDataSource,
  Fr,
  Gas,
  GasFees,
  GasSettings,
  GlobalVariables,
  NULLIFIER_SUBTREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
  PartialStateReference,
  PublicDataTreeLeaf,
  PublicDataWrite,
  RevertCode,
  StateReference,
  countAccumulatedItems,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot } from '@aztec/circuits.js/hash';
import { fr } from '@aztec/circuits.js/testing';
import { type AztecKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb';
import { type AppendOnlyTree, Poseidon, StandardTree, newTree } from '@aztec/merkle-tree';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { MerkleTrees } from '@aztec/world-state';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import { AvmFinalizedCallResult } from '../avm/avm_contract_call_result.js';
import { type AvmPersistableStateManager } from '../avm/journal/journal.js';
import { type InstructionSet } from '../avm/serialization/bytecode_serialization.js';
import { computeFeePayerBalanceStorageSlot } from './fee_payment.js';
import { WorldStateDB } from './public_db_sources.js';
import { type PublicTxResult, PublicTxSimulator } from './public_tx_simulator.js';

describe('public_tx_simulator', () => {
  // Nullifier must be >=128 since tree starts with 128 entries pre-filled
  const MIN_NULLIFIER = 128;
  // Gas settings.
  const gasLimits = new Gas(100, 150);
  const teardownGasLimits = new Gas(20, 30);
  const gasFees = new GasFees(2, 3);
  let maxFeesPerGas = gasFees;
  let maxPriorityFeesPerGas = GasFees.empty();

  // gasUsed for the tx after private execution, minus the teardownGasLimits.
  const privateGasUsed = new Gas(13, 17);

  // gasUsed for each enqueued call.
  const enqueuedCallGasUsed = new Gas(12, 34);

  let db: MerkleTreeWriteOperations;
  let worldStateDB: WorldStateDB;

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
    feePayer = AztecAddress.ZERO,
  }: {
    numberOfSetupCalls?: number;
    numberOfAppLogicCalls?: number;
    hasPublicTeardownCall?: boolean;
    feePayer?: AztecAddress;
  }) => {
    // seed with min nullifier to prevent insertion of a nullifier < min
    const tx = mockTx(/*seed=*/ MIN_NULLIFIER, {
      numberOfNonRevertiblePublicCallRequests: numberOfSetupCalls,
      numberOfRevertiblePublicCallRequests: numberOfAppLogicCalls,
      hasPublicTeardownCallRequest: hasPublicTeardownCall,
    });
    tx.data.constants.txContext.gasSettings = GasSettings.from({
      gasLimits,
      teardownGasLimits,
      maxFeesPerGas,
      maxPriorityFeesPerGas,
    });

    tx.data.forPublic!.nonRevertibleAccumulatedData.nullifiers[0] = new Fr(7777);
    tx.data.forPublic!.nonRevertibleAccumulatedData.nullifiers[1] = new Fr(8888);

    tx.data.forPublic!.revertibleAccumulatedData.nullifiers[0] = new Fr(9999);

    tx.data.gasUsed = privateGasUsed;
    if (hasPublicTeardownCall) {
      tx.data.gasUsed = tx.data.gasUsed.add(teardownGasLimits);
    }

    tx.data.feePayer = feePayer;

    return tx;
  };

  const setFeeBalance = async (feePayer: AztecAddress, balance: Fr) => {
    const feeJuiceAddress = ProtocolContractAddress.FeeJuice;
    const balanceSlot = computeFeePayerBalanceStorageSlot(feePayer);
    const balancePublicDataTreeLeafSlot = computePublicDataTreeLeafSlot(feeJuiceAddress, balanceSlot);
    await db.batchInsert(
      MerkleTreeId.PUBLIC_DATA_TREE,
      [new PublicDataTreeLeaf(balancePublicDataTreeLeafSlot, balance).toBuffer()],
      0,
    );
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

  const checkNullifierRoot = async (txResult: PublicTxResult) => {
    const siloedNullifiers = txResult.avmProvingRequest.inputs.output.accumulatedData.nullifiers;
    // Loop helpful for debugging so you can see root progression
    //for (const nullifier of siloedNullifiers) {
    //  await db.batchInsert(
    //    MerkleTreeId.NULLIFIER_TREE,
    //    [nullifier.toBuffer()],
    //    NULLIFIER_SUBTREE_HEIGHT,
    //  );
    //  console.log(`TESTING Nullifier tree root after insertion ${(await db.getStateReference()).partial.nullifierTree.root}`);
    //}
    // This is how the public processor inserts nullifiers.
    await db.batchInsert(
      MerkleTreeId.NULLIFIER_TREE,
      siloedNullifiers.map(n => n.toBuffer()),
      NULLIFIER_SUBTREE_HEIGHT,
    );
    const expectedRoot = (await db.getStateReference()).partial.nullifierTree.root;
    const gotRoot = txResult.avmProvingRequest.inputs.output.endTreeSnapshots.nullifierTree.root;
    expect(gotRoot).toEqual(expectedRoot);
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

  const createSimulator = ({
    doMerkleOperations = true,
    enforceFeePayment = true,
  }: {
    doMerkleOperations?: boolean;
    enforceFeePayment?: boolean;
  }) => {
    const simulator = new PublicTxSimulator(
      db,
      worldStateDB,
      new NoopTelemetryClient(),
      GlobalVariables.from({ ...GlobalVariables.empty(), gasFees }),
      doMerkleOperations,
      enforceFeePayment,
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
    return simulator;
  };

  beforeEach(async () => {
    const tmp = openTmpStore();
    const telemetryClient = new NoopTelemetryClient();
    db = await (await MerkleTrees.new(tmp, telemetryClient)).fork();
    worldStateDB = new WorldStateDB(db, mock<ContractDataSource>());

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
    const header = BlockHeader.empty();
    const stateReference = new StateReference(
      header.state.l1ToL2MessageTree,
      new PartialStateReference(header.state.partial.noteHashTree, header.state.partial.nullifierTree, snap),
    );
    // Clone the whole state because somewhere down the line (AbstractPhaseManager) the public data root is modified in the referenced header directly :/
    header.state = StateReference.fromBuffer(stateReference.toBuffer());

    simulator = createSimulator({});
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
      publicGas: expectedPublicGasUsed,
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
      publicGas: expectedPublicGasUsed,
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
      publicGas: expectedTeardownGasUsed,
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
      publicGas: expectedPublicGasUsed.add(expectedTeardownGasUsed),
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
      new PublicDataWrite(computePublicDataTreeLeafSlot(contractAddress, contractSlotA), fr(0x103)), // 0x101 replaced with 0x103
      new PublicDataWrite(computePublicDataTreeLeafSlot(contractAddress, contractSlotB), fr(0x151)),
      new PublicDataWrite(computePublicDataTreeLeafSlot(contractAddress, contractSlotC), fr(0x152)), // 0x201 replaced with 0x102 and then 0x152
    ]);
  });

  it('fails a transaction that reverts in setup', async function () {
    // seed with min nullifier to prevent insertion of a nullifier < min
    const tx = mockTx(/*seed=*/ MIN_NULLIFIER, {
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

    const siloedNullifiers = [new Fr(10000), new Fr(20000), new Fr(30000), new Fr(40000), new Fr(50000)];
    mockPublicExecutor([
      // SETUP
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[0]);
      },
      // APP LOGIC
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[1]);
        await stateManager.writeSiloedNullifier(siloedNullifiers[2]);
      },
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[3]);
        return Promise.resolve(appLogicFailure);
      },
      // TEARDOWN
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[4]);
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
      publicGas: expectedTotalGas.sub(privateGasUsed),
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
    const includedSiloedNullifiers = [
      ...tx.data.forPublic!.nonRevertibleAccumulatedData.nullifiers.filter(n => !n.isZero()),
      siloedNullifiers[0],
      // dropped revertibles and app logic
      //...tx.data.forPublic!.revertibleAccumulatedData.nullifiers.filter(n => !n.isZero()),
      //..siloedNullifiers[1...3]
      // teardown
      siloedNullifiers[4],
    ];
    expect(output.accumulatedData.nullifiers.filter(n => !n.isZero())).toEqual(includedSiloedNullifiers);
    await checkNullifierRoot(txResult);
  });

  it('includes a transaction that reverts in teardown only', async function () {
    const tx = mockTxWithPublicCalls({
      numberOfSetupCalls: 1,
      numberOfAppLogicCalls: 2,
      hasPublicTeardownCall: true,
    });

    const teardownFailure = new SimulationError('Simulation Failed in teardown', []);

    const siloedNullifiers = [new Fr(10000), new Fr(20000), new Fr(30000), new Fr(40000), new Fr(50000)];
    mockPublicExecutor([
      // SETUP
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[0]);
      },
      // APP LOGIC
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[1]);
        await stateManager.writeSiloedNullifier(siloedNullifiers[2]);
      },
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[3]);
      },
      // TEARDOWN
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[4]);
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
      publicGas: expectedTotalGas.sub(privateGasUsed),
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
    const includedSiloedNullifiers = [
      ...tx.data.forPublic!.nonRevertibleAccumulatedData.nullifiers.filter(n => !n.isZero()),
      siloedNullifiers[0],
      // dropped
      //...tx.data.forPublic!.revertibleAccumulatedData.nullifiers.filter(n => !n.isZero()),
      //..siloedNullifiers[1...4]
    ];
    expect(output.accumulatedData.nullifiers.filter(n => !n.isZero())).toEqual(includedSiloedNullifiers);
    await checkNullifierRoot(txResult);
  });

  it('includes a transaction that reverts in app logic and teardown', async function () {
    const tx = mockTxWithPublicCalls({
      numberOfSetupCalls: 1,
      numberOfAppLogicCalls: 2,
      hasPublicTeardownCall: true,
    });

    const appLogicFailure = new SimulationError('Simulation Failed in app logic', []);
    const teardownFailure = new SimulationError('Simulation Failed in teardown', []);
    const siloedNullifiers = [new Fr(10000), new Fr(20000), new Fr(30000), new Fr(40000), new Fr(50000)];
    mockPublicExecutor([
      // SETUP
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[0]);
      },
      // APP LOGIC
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[1]);
        await stateManager.writeSiloedNullifier(siloedNullifiers[2]);
      },
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[3]);
        return Promise.resolve(appLogicFailure);
      },
      // TEARDOWN
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[4]);
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
      publicGas: expectedTotalGas.sub(privateGasUsed),
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
    const includedSiloedNullifiers = [
      ...tx.data.forPublic!.nonRevertibleAccumulatedData.nullifiers.filter(n => !n.isZero()),
      siloedNullifiers[0],
      // dropped revertibles and app logic
      //...tx.data.forPublic!.revertibleAccumulatedData.nullifiers.filter(n => !n.isZero()),
      //..siloedNullifiers[1...4]
    ];
    expect(output.accumulatedData.nullifiers.filter(n => !n.isZero())).toEqual(includedSiloedNullifiers);
    await checkNullifierRoot(txResult);
  });

  it('nullifier tree root is right', async function () {
    const tx = mockTxWithPublicCalls({
      numberOfSetupCalls: 1,
      numberOfAppLogicCalls: 2,
      hasPublicTeardownCall: true,
    });

    const siloedNullifiers = [new Fr(10000), new Fr(20000), new Fr(30000), new Fr(40000), new Fr(50000)];

    mockPublicExecutor([
      // SETUP
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[0]);
      },
      // APP LOGIC
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[1]);
        await stateManager.writeSiloedNullifier(siloedNullifiers[2]);
      },
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[3]);
      },
      // TEARDOWN
      async (stateManager: AvmPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[4]);
      },
    ]);

    const txResult = await simulator.simulate(tx);

    await checkNullifierRoot(txResult);
  });

  it('runs a tx with non-empty priority fees', async () => {
    // gasFees = new GasFees(2, 3);
    maxPriorityFeesPerGas = new GasFees(5, 7);
    // The max fee is gasFee + priorityFee + 1.
    maxFeesPerGas = new GasFees(2 + 5 + 1, 3 + 7 + 1);

    const tx = mockTxWithPublicCalls({
      numberOfSetupCalls: 1,
      numberOfAppLogicCalls: 1,
      hasPublicTeardownCall: true,
    });

    const txResult = await simulator.simulate(tx);
    expect(txResult.revertCode).toEqual(RevertCode.OK);

    const expectedPublicGasUsed = enqueuedCallGasUsed.mul(2); // 1 for setup and 1 for app logic.
    const expectedTeardownGasUsed = enqueuedCallGasUsed;
    const expectedTotalGas = privateGasUsed.add(expectedPublicGasUsed).add(expectedTeardownGasUsed);
    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      teardownGas: expectedTeardownGasUsed,
      publicGas: expectedPublicGasUsed.add(expectedTeardownGasUsed),
    });

    const output = txResult.avmProvingRequest!.inputs.output;

    const expectedGasUsedForFee = expectedTotalGas.sub(expectedTeardownGasUsed).add(teardownGasLimits);
    expect(output.endGasUsed).toEqual(expectedGasUsedForFee);

    const totalFees = new GasFees(2 + 5, 3 + 7);
    const expectedTxFee = expectedGasUsedForFee.computeFee(totalFees);
    expect(output.transactionFee).toEqual(expectedTxFee);
  });

  describe('fees', () => {
    it('deducts fees from the fee payer balance', async () => {
      const feePayer = AztecAddress.random();
      await setFeeBalance(feePayer, Fr.MAX_FIELD_VALUE);

      const tx = mockTxWithPublicCalls({
        numberOfSetupCalls: 1,
        numberOfAppLogicCalls: 1,
        hasPublicTeardownCall: true,
        feePayer,
      });

      const txResult = await simulator.simulate(tx);
      expect(txResult.revertCode).toEqual(RevertCode.OK);
    });

    it('fails if fee payer cant pay for the tx', async () => {
      const feePayer = AztecAddress.random();

      await expect(
        simulator.simulate(
          mockTxWithPublicCalls({
            numberOfSetupCalls: 1,
            numberOfAppLogicCalls: 1,
            hasPublicTeardownCall: true,
            feePayer,
          }),
        ),
      ).rejects.toThrow(/Not enough balance for fee payer to pay for transaction/);
    });

    it('allows disabling fee balance checks for fee estimation', async () => {
      simulator = createSimulator({ enforceFeePayment: false });
      const feePayer = AztecAddress.random();

      const txResult = await simulator.simulate(
        mockTxWithPublicCalls({
          numberOfSetupCalls: 1,
          numberOfAppLogicCalls: 1,
          hasPublicTeardownCall: true,
          feePayer,
        }),
      );
      expect(txResult.revertCode).toEqual(RevertCode.OK);
    });
  });
});
