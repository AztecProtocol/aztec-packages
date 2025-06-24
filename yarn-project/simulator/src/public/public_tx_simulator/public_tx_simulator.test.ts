import {
  NULLIFIER_SUBTREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
  REGISTERER_CONTRACT_ADDRESS,
  REGISTERER_CONTRACT_CLASS_REGISTERED_MAGIC_VALUE,
} from '@aztec/constants';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import type { AztecKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb';
import { type AppendOnlyTree, Poseidon, StandardTree, newTree } from '@aztec/merkle-tree';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceStorageSlot } from '@aztec/protocol-contracts/fee-juice';
import { bufferAsFields } from '@aztec/stdlib/abi';
import { PublicDataWrite, RevertCode } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { SimulationError } from '@aztec/stdlib/errors';
import { Gas, GasFees, GasSettings } from '@aztec/stdlib/gas';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { LogHash, countAccumulatedItems } from '@aztec/stdlib/kernel';
import { ContractClassLogFields } from '@aztec/stdlib/logs';
import { L2ToL1Message, ScopedL2ToL1Message } from '@aztec/stdlib/messaging';
import { fr, makeContractClassPublic, mockTx } from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot, MerkleTreeId, PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import {
  BlockHeader,
  GlobalVariables,
  PartialStateReference,
  StateReference,
  Tx,
  TxExecutionPhase,
} from '@aztec/stdlib/tx';
import { NativeWorldStateService } from '@aztec/world-state';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import { AvmFinalizedCallResult } from '../avm/avm_contract_call_result.js';
import type { InstructionSet } from '../avm/serialization/bytecode_serialization.js';
import { PublicContractsDB } from '../public_db_sources.js';
import { PublicPersistableStateManager } from '../state_manager/state_manager.js';
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

  let merkleTrees: MerkleTreeWriteOperations;
  let merkleTreesCopy: MerkleTreeWriteOperations;
  let contractsDB: PublicContractsDB;

  let publicDataTree: AppendOnlyTree<Fr>;

  let treeStore: AztecKVStore;
  let simulator: PublicTxSimulator;
  let simulateInternal: jest.SpiedFunction<
    (
      stateManager: PublicPersistableStateManager,
      executionResult: any,
      allocatedGas: Gas,
      transactionFee: any,
      fnName: any,
      instructionSet: InstructionSet,
    ) => Promise<AvmFinalizedCallResult>
  >;

  const mockTxWithPublicCalls = async ({
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
    const tx = await mockTx(/*seed=*/ MIN_NULLIFIER, {
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

    tx.data.forPublic!.nonRevertibleAccumulatedData.nullifiers[0] = new Fr(0x7777);
    tx.data.forPublic!.nonRevertibleAccumulatedData.nullifiers[1] = new Fr(0x8888);
    tx.data.forPublic!.nonRevertibleAccumulatedData.noteHashes[0] = new Fr(0x9999);
    tx.data.forPublic!.nonRevertibleAccumulatedData.noteHashes[1] = new Fr(0xaaaa);
    tx.data.forPublic!.nonRevertibleAccumulatedData.l2ToL1Msgs[0] = new ScopedL2ToL1Message(
      new L2ToL1Message(EthAddress.fromNumber(0x5555), new Fr(0xbbbb)),
      AztecAddress.fromField(new Fr(0x6666)),
    );
    tx.data.forPublic!.nonRevertibleAccumulatedData.l2ToL1Msgs[1] = new ScopedL2ToL1Message(
      new L2ToL1Message(EthAddress.fromNumber(0x6666), new Fr(0xcccc)),
      AztecAddress.fromField(new Fr(0x7777)),
    );

    tx.data.forPublic!.revertibleAccumulatedData.nullifiers[0] = new Fr(0x9999);
    tx.data.forPublic!.revertibleAccumulatedData.noteHashes[0] = new Fr(0xbbbb);
    tx.data.forPublic!.revertibleAccumulatedData.l2ToL1Msgs[0] = new ScopedL2ToL1Message(
      new L2ToL1Message(EthAddress.fromNumber(0x7777), new Fr(0xdddd)),
      AztecAddress.fromField(new Fr(0x8888)),
    );

    tx.data.gasUsed = privateGasUsed;
    if (hasPublicTeardownCall) {
      tx.data.gasUsed = tx.data.gasUsed.add(teardownGasLimits);
    }

    tx.data.feePayer = feePayer;

    return tx;
  };

  const setFeeBalance = async (feePayer: AztecAddress, balance: Fr) => {
    const feeJuiceAddress = ProtocolContractAddress.FeeJuice;
    const balanceSlot = await computeFeePayerBalanceStorageSlot(feePayer);
    const balancePublicDataTreeLeafSlot = await computePublicDataTreeLeafSlot(feeJuiceAddress, balanceSlot);
    await merkleTrees.sequentialInsert(MerkleTreeId.PUBLIC_DATA_TREE, [
      new PublicDataTreeLeaf(balancePublicDataTreeLeafSlot, balance).toBuffer(),
    ]);
  };

  const mockPublicExecutor = (
    mockedSimulatorExecutions: ((stateManager: PublicPersistableStateManager) => Promise<SimulationError | void>)[],
  ) => {
    for (const executeSimulator of mockedSimulatorExecutions) {
      simulateInternal.mockImplementationOnce(
        async (
          stateManager: PublicPersistableStateManager,
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

  const mockContractClassForTx = async (tx: Tx, revertible = true) => {
    const publicContractClass = await makeContractClassPublic(42);
    const contractClassLogFields = [
      new Fr(REGISTERER_CONTRACT_CLASS_REGISTERED_MAGIC_VALUE),
      publicContractClass.id,
      new Fr(publicContractClass.version),
      publicContractClass.artifactHash,
      publicContractClass.privateFunctionsRoot,
      ...bufferAsFields(
        publicContractClass.packedBytecode,
        Math.ceil(publicContractClass.packedBytecode.length / 31) + 1,
      ),
    ];
    const contractAddress = new AztecAddress(new Fr(REGISTERER_CONTRACT_ADDRESS));
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

  const checkNullifierRoot = async (txResult: PublicTxResult) => {
    const siloedNullifiers = txResult.avmProvingRequest.inputs.publicInputs.accumulatedData.nullifiers;
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
    await merkleTreesCopy.batchInsert(
      MerkleTreeId.NULLIFIER_TREE,
      siloedNullifiers.map(n => n.toBuffer()),
      NULLIFIER_SUBTREE_HEIGHT,
    );
    const expectedRoot = new Fr((await merkleTrees.getTreeInfo(MerkleTreeId.NULLIFIER_TREE)).root);
    const gotRoot = new Fr((await merkleTrees.getTreeInfo(MerkleTreeId.NULLIFIER_TREE)).root);
    const gotRootPublicInputs = txResult.avmProvingRequest.inputs.publicInputs.endTreeSnapshots.nullifierTree.root;
    expect(gotRoot).toEqual(expectedRoot);
    expect(gotRootPublicInputs).toEqual(expectedRoot);
  };

  const expectAvailableGasForCalls = (availableGases: Gas[]) => {
    expect(simulateInternal).toHaveBeenCalledTimes(availableGases.length);
    availableGases.forEach((availableGas, i) => {
      expect(simulateInternal).toHaveBeenNthCalledWith(
        i + 1,
        expect.anything(), // AvmPersistableStateManager
        expect.anything(), // PublicCallRequestWithCalldata
        Gas.from(availableGas),
        expect.anything(), // txFee
        expect.anything(), // fnName
      );
    });
  };

  const createSimulator = ({
    doMerkleOperations = true,
    skipFeeEnforcement = false,
  }: {
    doMerkleOperations?: boolean;
    skipFeeEnforcement?: boolean;
  }) => {
    const simulator = new PublicTxSimulator(
      merkleTrees,
      contractsDB,
      GlobalVariables.from({ ...GlobalVariables.empty(), gasFees }),
      doMerkleOperations,
      skipFeeEnforcement,
    );

    // Mock the internal private function. Borrowed from https://stackoverflow.com/a/71033167
    simulateInternal = jest.spyOn(
      simulator as unknown as { simulateEnqueuedCallInternal: PublicTxSimulator['simulateEnqueuedCallInternal'] },
      'simulateEnqueuedCallInternal',
    );
    simulateInternal.mockImplementation(
      (
        _stateManager: PublicPersistableStateManager,
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
    merkleTrees = await (await NativeWorldStateService.tmp()).fork();
    merkleTreesCopy = await (await NativeWorldStateService.tmp()).fork();
    contractsDB = new PublicContractsDB(mock<ContractDataSource>());

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
    const tx = await mockTxWithPublicCalls({
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
      billedGas: expectedTotalGas,
      teardownGas: Gas.empty(),
      publicGas: expectedPublicGasUsed,
    });

    const availableGasForFirstSetup = gasLimits.sub(privateGasUsed);
    const availableGasForSecondSetup = availableGasForFirstSetup.sub(enqueuedCallGasUsed);
    expectAvailableGasForCalls([availableGasForFirstSetup, availableGasForSecondSetup]);

    const output = txResult.avmProvingRequest!.inputs.publicInputs;

    const expectedGasUsedForFee = expectedTotalGas;
    const expectedTxFee = expectedTotalGas.computeFee(gasFees);
    expect(output.endGasUsed).toEqual(expectedGasUsedForFee);
    expect(output.transactionFee).toEqual(expectedTxFee);

    // We keep all data.
    expect(countAccumulatedItems(output.accumulatedData.nullifiers)).toBe(3);
  });

  it('runs a tx with enqueued public calls in app logic phase only', async () => {
    const tx = await mockTxWithPublicCalls({
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
      billedGas: expectedTotalGas,
      teardownGas: Gas.empty(),
      publicGas: expectedPublicGasUsed,
    });

    const availableGasForFirstAppLogic = gasLimits.sub(privateGasUsed);
    const availableGasForSecondAppLogic = availableGasForFirstAppLogic.sub(enqueuedCallGasUsed);
    expectAvailableGasForCalls([availableGasForFirstAppLogic, availableGasForSecondAppLogic]);

    const output = txResult.avmProvingRequest!.inputs.publicInputs;

    const expectedGasUsedForFee = expectedTotalGas;
    const expectedTxFee = expectedTotalGas.computeFee(gasFees);
    expect(output.endGasUsed).toEqual(expectedGasUsedForFee);
    expect(output.transactionFee).toEqual(expectedTxFee);

    // We keep all data.
    expect(countAccumulatedItems(output.accumulatedData.nullifiers)).toBe(3);
  });

  it('runs a tx with enqueued public calls in teardown phase only', async () => {
    const tx = await mockTxWithPublicCalls({
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
    const expectedBilledGas = privateGasUsed.add(teardownGasLimits);
    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      billedGas: expectedBilledGas,
      teardownGas: expectedTeardownGasUsed,
      publicGas: expectedTeardownGasUsed,
    });

    expectAvailableGasForCalls([teardownGasLimits]);

    const output = txResult.avmProvingRequest!.inputs.publicInputs;

    const expectedGasUsedForFee = expectedTotalGas.sub(expectedTeardownGasUsed).add(teardownGasLimits);
    const expectedTxFee = expectedGasUsedForFee.computeFee(gasFees);
    expect(output.endGasUsed).toEqual(expectedGasUsedForFee);
    expect(output.transactionFee).toEqual(expectedTxFee);

    // We keep all data.
    expect(countAccumulatedItems(output.accumulatedData.nullifiers)).toBe(3);
  });

  it('runs a tx with all phases', async () => {
    const tx = await mockTxWithPublicCalls({
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
    const expectedBilledGas = privateGasUsed.add(expectedPublicGasUsed).add(teardownGasLimits);

    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      billedGas: expectedBilledGas,
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

    const output = txResult.avmProvingRequest!.inputs.publicInputs;

    const expectedGasUsedForFee = expectedTotalGas.sub(expectedTeardownGasUsed).add(teardownGasLimits);
    const expectedTxFee = expectedGasUsedForFee.computeFee(gasFees);
    expect(output.endGasUsed).toEqual(expectedGasUsedForFee);
    expect(output.transactionFee).toEqual(expectedTxFee);

    // We keep all data.
    expect(countAccumulatedItems(output.accumulatedData.nullifiers)).toBe(3);
  });

  it('deduplicates public data writes', async function () {
    const tx = await mockTxWithPublicCalls({
      numberOfSetupCalls: 1,
      numberOfAppLogicCalls: 1,
      hasPublicTeardownCall: true,
    });

    const revertibleRequests = tx.data.getRevertiblePublicCallRequests();

    const contractAddress = revertibleRequests[0].contractAddress;
    const contractSlotA = fr(0x100);
    const contractSlotB = fr(0x150);
    const contractSlotC = fr(0x200);

    mockPublicExecutor([
      // SETUP
      async (_stateManager: PublicPersistableStateManager) => {
        // Nothing happened in setup phase.
      },
      // APP LOGIC
      async (stateManager: PublicPersistableStateManager) => {
        // mock storage writes on the state manager
        await stateManager.writeStorage(contractAddress, contractSlotA, fr(0x101));
        await stateManager.writeStorage(contractAddress, contractSlotB, fr(0x151));
        await stateManager.readStorage(contractAddress, contractSlotA);
      },
      async (stateManager: PublicPersistableStateManager) => {
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

    const output = txResult.avmProvingRequest!.inputs.publicInputs;

    const numPublicDataWrites = 3;
    expect(countAccumulatedItems(output.accumulatedData.publicDataWrites)).toBe(numPublicDataWrites);
    expect(output.accumulatedData.publicDataWrites.slice(0, numPublicDataWrites)).toEqual([
      new PublicDataWrite(await computePublicDataTreeLeafSlot(contractAddress, contractSlotA), fr(0x103)), // 0x101 replaced with 0x103
      new PublicDataWrite(await computePublicDataTreeLeafSlot(contractAddress, contractSlotB), fr(0x151)),
      new PublicDataWrite(await computePublicDataTreeLeafSlot(contractAddress, contractSlotC), fr(0x152)), // 0x201 replaced with 0x102 and then 0x152
    ]);
  });

  it('fails a transaction that reverts in setup', async function () {
    // seed with min nullifier to prevent insertion of a nullifier < min
    const tx = await mockTx(/*seed=*/ MIN_NULLIFIER, {
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

  it('non-reverting transactions keep all side effects', async function () {
    const tx = await mockTxWithPublicCalls({
      numberOfSetupCalls: 1,
      numberOfAppLogicCalls: 2,
      hasPublicTeardownCall: true,
    });

    const siloedNullifiers = [new Fr(0x10000), new Fr(0x20000), new Fr(0x30000), new Fr(0x40000), new Fr(0x50000)];
    const noteHashes = [new Fr(0x60000), new Fr(0x70000), new Fr(0x80000), new Fr(0x90000), new Fr(0xa0000)];
    const l2ToL1Addresses = [new Fr(0xa0000), new Fr(0xb0000), new Fr(0xc0000), new Fr(0xf0000), new Fr(0x10000)].map(
      a => new AztecAddress(a),
    );
    const l2ToL1Recipients = [new Fr(0xb0000), new Fr(0xc0000), new Fr(0xd0000), new Fr(0xe0000), new Fr(0xf0000)];
    const l2ToL1Contents = [new Fr(0x100000), new Fr(0x110000), new Fr(0x120000), new Fr(0x130000), new Fr(0x140000)];
    const l2ToL1Messages = l2ToL1Recipients.map((recipient, i) =>
      new L2ToL1Message(EthAddress.fromField(recipient), l2ToL1Contents[i]).scope(l2ToL1Addresses[i]),
    );

    mockPublicExecutor([
      // SETUP
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[0]);
        await stateManager.writeUniqueNoteHash(noteHashes[0]);
        stateManager.writeL2ToL1Message(l2ToL1Addresses[0], l2ToL1Recipients[0], l2ToL1Contents[0]);
      },
      // APP LOGIC
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[1]);
        await stateManager.writeSiloedNullifier(siloedNullifiers[2]);
        await stateManager.writeUniqueNoteHash(noteHashes[1]);
        await stateManager.writeUniqueNoteHash(noteHashes[2]);
        stateManager.writeL2ToL1Message(l2ToL1Addresses[1], l2ToL1Recipients[1], l2ToL1Contents[1]);
        stateManager.writeL2ToL1Message(l2ToL1Addresses[2], l2ToL1Recipients[2], l2ToL1Contents[2]);
      },
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[3]);
        await stateManager.writeUniqueNoteHash(noteHashes[3]);
        stateManager.writeL2ToL1Message(l2ToL1Addresses[3], l2ToL1Recipients[3], l2ToL1Contents[3]);
      },
      // TEARDOWN
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[4]);
        await stateManager.writeUniqueNoteHash(noteHashes[4]);
        stateManager.writeL2ToL1Message(l2ToL1Addresses[4], l2ToL1Recipients[4], l2ToL1Contents[4]);
      },
    ]);

    const txResult = await simulator.simulate(tx);

    expect(txResult.processedPhases).toHaveLength(3);
    expect(txResult.processedPhases).toEqual([
      expect.objectContaining({ phase: TxExecutionPhase.SETUP, revertReason: undefined }),
      expect.objectContaining({ phase: TxExecutionPhase.APP_LOGIC, revertReason: undefined }),
      expect.objectContaining({ phase: TxExecutionPhase.TEARDOWN, revertReason: undefined }),
    ]);

    expect(txResult.revertCode).toEqual(RevertCode.OK);
    expect(txResult.revertReason).toBeUndefined();

    const expectedSetupGas = enqueuedCallGasUsed;
    const expectedAppLogicGas = enqueuedCallGasUsed.mul(2);
    const expectedTeardownGasUsed = enqueuedCallGasUsed;
    const expectedTotalGas = privateGasUsed.add(expectedSetupGas).add(expectedAppLogicGas).add(expectedTeardownGasUsed);
    const expectedBilledGas = privateGasUsed.add(expectedSetupGas).add(expectedAppLogicGas).add(teardownGasLimits);
    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      billedGas: expectedBilledGas,
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

    const output = txResult.avmProvingRequest!.inputs.publicInputs;

    const expectedGasUsedForFee = expectedTotalGas.sub(expectedTeardownGasUsed).add(teardownGasLimits);
    const expectedTxFee = expectedGasUsedForFee.computeFee(gasFees);
    expect(output.endGasUsed).toEqual(expectedGasUsedForFee);
    expect(output.transactionFee).toEqual(expectedTxFee);

    // We keep all side effects
    expect(countAccumulatedItems(output.accumulatedData.nullifiers)).toBe(8);
    expect(countAccumulatedItems(output.accumulatedData.noteHashes)).toBe(8);
    expect(countAccumulatedItems(output.accumulatedData.l2ToL1Msgs)).toBe(8);

    // Verify that the actual side effects are as expected and in the right order.
    const includedSiloedNullifiers = [
      ...tx.data.forPublic!.nonRevertibleAccumulatedData.nullifiers.filter(n => !n.isZero()),
      siloedNullifiers[0],
      ...tx.data.forPublic!.revertibleAccumulatedData.nullifiers.filter(n => !n.isZero()),
      ...siloedNullifiers.slice(1, 4),
      // teardown
      siloedNullifiers[4],
    ];
    expect(output.accumulatedData.nullifiers.filter(n => !n.isZero())).toEqual(includedSiloedNullifiers);

    const includedNoteHashes = [
      ...tx.data.forPublic!.nonRevertibleAccumulatedData.noteHashes.filter(n => !n.isZero()),
      noteHashes[0],
      // Cannot use actual revertible note hashes because the AVM will silo them and make them unique.
      // So we'd have to do so here to actually compare. For now, we just check that the correct number
      // of nonzero revertible notes end up in the output.
      //...tx.data.forPublic!.revertibleAccumulatedData.noteHashes.filter(n => !n.isZero()),
      ...Array.from(
        { length: tx.data.forPublic!.revertibleAccumulatedData.noteHashes.filter(n => !n.isZero()).length },
        () => expect.anything(),
      ),
      ...noteHashes.slice(1, 4),
      // Teardown
      noteHashes[4],
    ];
    expect(output.accumulatedData.noteHashes.filter(n => !n.isZero())).toEqual(includedNoteHashes);

    const includedL2ToL1Messages = [
      ...tx.data.forPublic!.nonRevertibleAccumulatedData.l2ToL1Msgs.filter(m => !m.isEmpty()),
      l2ToL1Messages[0],
      ...tx.data.forPublic!.revertibleAccumulatedData.l2ToL1Msgs.filter(m => !m.isEmpty()),
      ...l2ToL1Messages.slice(1, 4),
      // Teardown
      l2ToL1Messages[4],
    ];
    expect(output.accumulatedData.l2ToL1Msgs.filter(m => !m.isEmpty())).toEqual(includedL2ToL1Messages);

    await checkNullifierRoot(txResult);
  });

  it('includes a transaction that reverts in app logic only', async function () {
    const tx = await mockTxWithPublicCalls({
      numberOfSetupCalls: 1,
      numberOfAppLogicCalls: 2,
      hasPublicTeardownCall: true,
    });

    const appLogicFailure = new SimulationError('Simulation Failed in app logic', []);

    const siloedNullifiers = [new Fr(0x10000), new Fr(0x20000), new Fr(0x30000), new Fr(0x40000), new Fr(0x50000)];
    const noteHashes = [new Fr(0x60000), new Fr(0x70000), new Fr(0x80000), new Fr(0x90000), new Fr(0xa0000)];
    const l2ToL1Addresses = [new Fr(0xa0000), new Fr(0xb0000), new Fr(0xc0000), new Fr(0xf0000), new Fr(0x10000)].map(
      a => new AztecAddress(a),
    );
    const l2ToL1Recipients = [new Fr(0xb0000), new Fr(0xc0000), new Fr(0xd0000), new Fr(0xe0000), new Fr(0xf0000)];
    const l2ToL1Contents = [new Fr(0x100000), new Fr(0x110000), new Fr(0x120000), new Fr(0x130000), new Fr(0x140000)];
    const l2ToL1Messages = l2ToL1Recipients.map((recipient, i) =>
      new L2ToL1Message(EthAddress.fromField(recipient), l2ToL1Contents[i]).scope(l2ToL1Addresses[i]),
    );

    mockPublicExecutor([
      // SETUP
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[0]);
        await stateManager.writeUniqueNoteHash(noteHashes[0]);
        stateManager.writeL2ToL1Message(l2ToL1Addresses[0], l2ToL1Recipients[0], l2ToL1Contents[0]);
      },
      // APP LOGIC
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[1]);
        await stateManager.writeSiloedNullifier(siloedNullifiers[2]);
        await stateManager.writeUniqueNoteHash(noteHashes[1]);
        await stateManager.writeUniqueNoteHash(noteHashes[2]);
        stateManager.writeL2ToL1Message(l2ToL1Addresses[1], l2ToL1Recipients[1], l2ToL1Contents[1]);
        stateManager.writeL2ToL1Message(l2ToL1Addresses[2], l2ToL1Recipients[2], l2ToL1Contents[2]);
      },
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[3]);
        await stateManager.writeUniqueNoteHash(noteHashes[3]);
        stateManager.writeL2ToL1Message(l2ToL1Addresses[3], l2ToL1Recipients[3], l2ToL1Contents[3]);
        return Promise.resolve(appLogicFailure);
      },
      // TEARDOWN
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[4]);
        await stateManager.writeUniqueNoteHash(noteHashes[4]);
        stateManager.writeL2ToL1Message(l2ToL1Addresses[4], l2ToL1Recipients[4], l2ToL1Contents[4]);
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
    const expectedBilledGas = privateGasUsed.add(expectedSetupGas).add(expectedAppLogicGas).add(teardownGasLimits);
    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      billedGas: expectedBilledGas,
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

    const output = txResult.avmProvingRequest!.inputs.publicInputs;

    const expectedGasUsedForFee = expectedTotalGas.sub(expectedTeardownGasUsed).add(teardownGasLimits);
    const expectedTxFee = expectedGasUsedForFee.computeFee(gasFees);
    expect(output.endGasUsed).toEqual(expectedGasUsedForFee);
    expect(output.transactionFee).toEqual(expectedTxFee);

    // We keep only the non-revertible data and setup
    expect(countAccumulatedItems(output.accumulatedData.nullifiers)).toBe(4);
    expect(countAccumulatedItems(output.accumulatedData.noteHashes)).toBe(4);
    expect(countAccumulatedItems(output.accumulatedData.l2ToL1Msgs)).toBe(4);

    // Verify that the actual side effects are as expected and in the right order.
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

    const includedNoteHashes = [
      ...tx.data.forPublic!.nonRevertibleAccumulatedData.noteHashes.filter(n => !n.isZero()),
      noteHashes[0],
      // Teardown
      noteHashes[4],
    ];
    expect(output.accumulatedData.noteHashes.filter(n => !n.isZero())).toEqual(includedNoteHashes);

    const includedL2ToL1Messages = [
      ...tx.data.forPublic!.nonRevertibleAccumulatedData.l2ToL1Msgs.filter(m => !m.isEmpty()),
      l2ToL1Messages[0],
      // Teardown
      l2ToL1Messages[4],
    ];
    expect(output.accumulatedData.l2ToL1Msgs.filter(m => !m.isEmpty())).toEqual(includedL2ToL1Messages);

    await checkNullifierRoot(txResult);
  });

  it('includes a transaction that reverts in teardown only', async function () {
    const tx = await mockTxWithPublicCalls({
      numberOfSetupCalls: 1,
      numberOfAppLogicCalls: 2,
      hasPublicTeardownCall: true,
    });

    const teardownFailure = new SimulationError('Simulation Failed in teardown', []);

    const siloedNullifiers = [new Fr(10000), new Fr(20000), new Fr(30000), new Fr(40000), new Fr(50000)];
    const noteHashes = [new Fr(0x60000), new Fr(0x70000), new Fr(0x80000), new Fr(0x90000), new Fr(0xa0000)];
    const l2ToL1Addresses = [new Fr(0xa0000), new Fr(0xb0000), new Fr(0xc0000), new Fr(0xf0000), new Fr(0x10000)].map(
      a => new AztecAddress(a),
    );
    const l2ToL1Recipients = [new Fr(0xb0000), new Fr(0xc0000), new Fr(0xd0000), new Fr(0xe0000), new Fr(0xf0000)];
    const l2ToL1Contents = [new Fr(0x100000), new Fr(0x110000), new Fr(0x120000), new Fr(0x130000), new Fr(0x140000)];
    const l2ToL1Messages = l2ToL1Recipients.map((recipient, i) =>
      new L2ToL1Message(EthAddress.fromField(recipient), l2ToL1Contents[i]).scope(l2ToL1Addresses[i]),
    );

    mockPublicExecutor([
      // SETUP
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[0]);
        await stateManager.writeUniqueNoteHash(noteHashes[0]);
        stateManager.writeL2ToL1Message(l2ToL1Addresses[0], l2ToL1Recipients[0], l2ToL1Contents[0]);
      },
      // APP LOGIC
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[1]);
        await stateManager.writeSiloedNullifier(siloedNullifiers[2]);
        await stateManager.writeUniqueNoteHash(noteHashes[1]);
        await stateManager.writeUniqueNoteHash(noteHashes[2]);
        stateManager.writeL2ToL1Message(l2ToL1Addresses[1], l2ToL1Recipients[1], l2ToL1Contents[1]);
        stateManager.writeL2ToL1Message(l2ToL1Addresses[2], l2ToL1Recipients[2], l2ToL1Contents[2]);
      },
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[3]);
        await stateManager.writeUniqueNoteHash(noteHashes[3]);
        stateManager.writeL2ToL1Message(l2ToL1Addresses[3], l2ToL1Recipients[3], l2ToL1Contents[3]);
      },
      // TEARDOWN
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[4]);
        await stateManager.writeUniqueNoteHash(noteHashes[4]);
        stateManager.writeL2ToL1Message(l2ToL1Addresses[4], l2ToL1Recipients[4], l2ToL1Contents[4]);
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
    const expectedBilledGas = privateGasUsed.add(expectedSetupGas).add(expectedAppLogicGas).add(teardownGasLimits);
    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      billedGas: expectedBilledGas,
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

    const output = txResult.avmProvingRequest!.inputs.publicInputs;

    // Should still charge the full teardownGasLimits for fee even though teardown reverted.
    const expectedGasUsedForFee = expectedTotalGas.sub(expectedTeardownGasUsed).add(teardownGasLimits);
    const expectedTxFee = expectedGasUsedForFee.computeFee(gasFees);
    expect(output.endGasUsed).toEqual(expectedGasUsedForFee);
    expect(output.transactionFee).toEqual(expectedTxFee);

    // We keep only the non-revertible data and setup
    expect(countAccumulatedItems(output.accumulatedData.nullifiers)).toBe(3);
    expect(countAccumulatedItems(output.accumulatedData.noteHashes)).toBe(3);
    expect(countAccumulatedItems(output.accumulatedData.l2ToL1Msgs)).toBe(3);

    // Verify that the actual side effects are as expected and in the right order.
    const includedSiloedNullifiers = [
      ...tx.data.forPublic!.nonRevertibleAccumulatedData.nullifiers.filter(n => !n.isZero()),
      siloedNullifiers[0],
      // dropped
      //...tx.data.forPublic!.revertibleAccumulatedData.nullifiers.filter(n => !n.isZero()),
      //..siloedNullifiers[1...4]
    ];
    expect(output.accumulatedData.nullifiers.filter(n => !n.isZero())).toEqual(includedSiloedNullifiers);

    const includedNoteHashes = [
      ...tx.data.forPublic!.nonRevertibleAccumulatedData.noteHashes.filter(n => !n.isZero()),
      noteHashes[0],
    ];
    expect(output.accumulatedData.noteHashes.filter(n => !n.isZero())).toEqual(includedNoteHashes);

    const includedL2ToL1Messages = [
      ...tx.data.forPublic!.nonRevertibleAccumulatedData.l2ToL1Msgs.filter(m => !m.isEmpty()),
      l2ToL1Messages[0],
    ];
    expect(output.accumulatedData.l2ToL1Msgs.filter(m => !m.isEmpty())).toEqual(includedL2ToL1Messages);
    await checkNullifierRoot(txResult);
  });

  it('includes a transaction that reverts in app logic and teardown', async function () {
    const tx = await mockTxWithPublicCalls({
      numberOfSetupCalls: 1,
      numberOfAppLogicCalls: 2,
      hasPublicTeardownCall: true,
    });

    const appLogicFailure = new SimulationError('Simulation Failed in app logic', []);
    const teardownFailure = new SimulationError('Simulation Failed in teardown', []);
    const siloedNullifiers = [new Fr(10000), new Fr(20000), new Fr(30000), new Fr(40000), new Fr(50000)];
    const noteHashes = [new Fr(60000), new Fr(70000), new Fr(80000), new Fr(90000), new Fr(100000)];
    const l2ToL1Recipients = [new Fr(110000), new Fr(120000), new Fr(130000), new Fr(140000), new Fr(150000)];
    const l2ToL1Contents = [new Fr(160000), new Fr(170000), new Fr(180000), new Fr(190000), new Fr(200000)];

    mockPublicExecutor([
      // SETUP
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[0]);
        await stateManager.writeUniqueNoteHash(noteHashes[0]);
        stateManager.writeL2ToL1Message(await AztecAddress.random(), l2ToL1Recipients[0], l2ToL1Contents[0]);
      },
      // APP LOGIC
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[1]);
        await stateManager.writeSiloedNullifier(siloedNullifiers[2]);
        await stateManager.writeUniqueNoteHash(noteHashes[1]);
        await stateManager.writeUniqueNoteHash(noteHashes[2]);
        stateManager.writeL2ToL1Message(await AztecAddress.random(), l2ToL1Recipients[1], l2ToL1Contents[1]);
        stateManager.writeL2ToL1Message(await AztecAddress.random(), l2ToL1Recipients[2], l2ToL1Contents[2]);
      },
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[3]);
        await stateManager.writeUniqueNoteHash(noteHashes[3]);
        stateManager.writeL2ToL1Message(await AztecAddress.random(), l2ToL1Recipients[3], l2ToL1Contents[3]);
        return Promise.resolve(appLogicFailure);
      },
      // TEARDOWN
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[4]);
        await stateManager.writeUniqueNoteHash(noteHashes[4]);
        stateManager.writeL2ToL1Message(await AztecAddress.random(), l2ToL1Recipients[4], l2ToL1Contents[4]);
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
    const expectedBilledGas = privateGasUsed.add(expectedSetupGas).add(expectedAppLogicGas).add(teardownGasLimits);
    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      billedGas: expectedBilledGas,
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

    const output = txResult.avmProvingRequest!.inputs.publicInputs;

    // Should still charge the full teardownGasLimits for fee even though teardown reverted.
    const expectedGasUsedForFee = expectedTotalGas.sub(expectedTeardownGasUsed).add(teardownGasLimits);
    const expectedTxFee = expectedGasUsedForFee.computeFee(gasFees);
    expect(output.endGasUsed).toEqual(expectedGasUsedForFee);
    expect(output.transactionFee).toEqual(expectedTxFee);

    // We keep only the non-revertible data and setup
    expect(countAccumulatedItems(output.accumulatedData.nullifiers)).toBe(3);
    expect(countAccumulatedItems(output.accumulatedData.noteHashes)).toBe(3);
    expect(countAccumulatedItems(output.accumulatedData.l2ToL1Msgs)).toBe(3);

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
    const tx = await mockTxWithPublicCalls({
      numberOfSetupCalls: 1,
      numberOfAppLogicCalls: 2,
      hasPublicTeardownCall: true,
    });

    const siloedNullifiers = [new Fr(10000), new Fr(20000), new Fr(30000), new Fr(40000), new Fr(50000)];

    mockPublicExecutor([
      // SETUP
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[0]);
      },
      // APP LOGIC
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[1]);
        await stateManager.writeSiloedNullifier(siloedNullifiers[2]);
      },
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[3]);
      },
      // TEARDOWN
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[4]);
      },
    ]);

    const txResult = await simulator.simulate(tx);

    await checkNullifierRoot(txResult);
  });

  it.each([
    [' not', 'revertible'],
    ['', 'non-revertible'],
  ])('after a revert, does%s retain contract classes emitted from %s logs', async (_, kind) => {
    const tx = await mockTxWithPublicCalls({
      numberOfSetupCalls: 1,
      numberOfAppLogicCalls: 2,
      hasPublicTeardownCall: true,
    });

    const contractClassId = await mockContractClassForTx(tx, kind == 'revertible');
    const appLogicFailure = new SimulationError('Simulation Failed in app logic', []);
    const siloedNullifiers = [new Fr(10000), new Fr(20000), new Fr(30000), new Fr(40000), new Fr(50000)];
    mockPublicExecutor([
      // SETUP
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[0]);
      },
      // APP LOGIC
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[1]);
        await stateManager.writeSiloedNullifier(siloedNullifiers[2]);
      },
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[3]);
        return Promise.resolve(appLogicFailure);
      },
      // TEARDOWN
      async (stateManager: PublicPersistableStateManager) => {
        await stateManager.writeSiloedNullifier(siloedNullifiers[4]);
      },
    ]);

    const txResult = await simulator.simulate(tx);

    expect(txResult.revertCode).toEqual(RevertCode.APP_LOGIC_REVERTED);
    // tx reports app logic failure
    expect(txResult.revertReason).toBe(appLogicFailure);

    // Note that we do not check tx.data.forPublic? since these are not mutated in the case of a revert.
    // When contract class logs are fields and only stored here, they will be filtered after simulation
    // in processed_tx.ts -> makeProcessedTxFromTxWithPublicCalls() like PrivateLogs.

    const contractClass = await contractsDB.getContractClass(contractClassId);
    if (kind == 'revertible') {
      expect(contractClass).toBeUndefined();
    } else {
      expect(contractClass).toBeDefined();
    }
  });

  it('runs a tx with non-empty priority fees', async () => {
    // gasFees = new GasFees(2, 3);
    maxPriorityFeesPerGas = new GasFees(5, 7);
    // The max fee is gasFee + priorityFee + 1.
    maxFeesPerGas = new GasFees(2 + 5 + 1, 3 + 7 + 1);

    const tx = await mockTxWithPublicCalls({
      numberOfSetupCalls: 1,
      numberOfAppLogicCalls: 1,
      hasPublicTeardownCall: true,
    });

    const txResult = await simulator.simulate(tx);
    expect(txResult.revertCode).toEqual(RevertCode.OK);

    const expectedPublicGasUsed = enqueuedCallGasUsed.mul(2); // 1 for setup and 1 for app logic.
    const expectedTeardownGasUsed = enqueuedCallGasUsed;
    const expectedTotalGas = privateGasUsed.add(expectedPublicGasUsed).add(expectedTeardownGasUsed);
    const expectedBilledGas = privateGasUsed.add(expectedPublicGasUsed).add(teardownGasLimits);
    expect(txResult.gasUsed).toEqual({
      totalGas: expectedTotalGas,
      billedGas: expectedBilledGas,
      teardownGas: expectedTeardownGasUsed,
      publicGas: expectedPublicGasUsed.add(expectedTeardownGasUsed),
    });

    const output = txResult.avmProvingRequest!.inputs.publicInputs;

    const expectedGasUsedForFee = expectedTotalGas.sub(expectedTeardownGasUsed).add(teardownGasLimits);
    expect(output.endGasUsed).toEqual(expectedGasUsedForFee);

    const totalFees = new GasFees(2 + 5, 3 + 7);
    const expectedTxFee = expectedGasUsedForFee.computeFee(totalFees);
    expect(output.transactionFee).toEqual(expectedTxFee);
  });

  describe('fees', () => {
    it('deducts fees from the fee payer balance', async () => {
      const feePayer = await AztecAddress.random();
      await setFeeBalance(feePayer, Fr.MAX_FIELD_VALUE);

      const tx = await mockTxWithPublicCalls({
        numberOfSetupCalls: 1,
        numberOfAppLogicCalls: 1,
        hasPublicTeardownCall: true,
        feePayer,
      });

      const txResult = await simulator.simulate(tx);
      expect(txResult.revertCode).toEqual(RevertCode.OK);
    });

    it('fails if fee payer cant pay for the tx', async () => {
      const feePayer = await AztecAddress.random();

      await expect(
        simulator.simulate(
          await mockTxWithPublicCalls({
            numberOfSetupCalls: 1,
            numberOfAppLogicCalls: 1,
            hasPublicTeardownCall: true,
            feePayer,
          }),
        ),
      ).rejects.toThrow(/Not enough balance for fee payer to pay for transaction/);
    });

    it('allows disabling fee balance checks for fee estimation', async () => {
      simulator = createSimulator({ skipFeeEnforcement: true });
      const feePayer = await AztecAddress.random();

      const txResult = await simulator.simulate(
        await mockTxWithPublicCalls({
          numberOfSetupCalls: 1,
          numberOfAppLogicCalls: 1,
          hasPublicTeardownCall: true,
          feePayer,
        }),
      );
      expect(txResult.revertCode).toEqual(RevertCode.OK);
    });
  });

  it('nullifier collision in insertRevertiblesFromPrivate skips app logic but executes teardown', async () => {
    // Mock a transaction with all three phases
    const tx = await mockTxWithPublicCalls({
      numberOfSetupCalls: 1,
      numberOfAppLogicCalls: 1,
      hasPublicTeardownCall: true,
    });

    const duplicateNullifier = new Fr(10000);
    tx.data.forPublic!.revertibleAccumulatedData.nullifiers[0] = duplicateNullifier;
    tx.data.forPublic!.revertibleAccumulatedData.nullifiers[1] = duplicateNullifier;

    // Simulate the transaction
    const txResult = await simulator.simulate(tx);

    // Verify that the transaction has app logic reverted code
    expect(txResult.revertCode).toEqual(RevertCode.APP_LOGIC_REVERTED);

    // Verify that there are only 2 phases processed (setup and teardown), since app logic is skipped
    expect(txResult.processedPhases).toEqual([
      expect.objectContaining({ phase: TxExecutionPhase.SETUP }),
      expect.objectContaining({ phase: TxExecutionPhase.TEARDOWN }),
    ]);

    // Verify that the SimulationError contains information about the nullifier collision
    const simulationError = txResult.revertReason as SimulationError;
    expect(simulationError.getOriginalMessage()).toContain('Nullifier collision');
  });
});
