import { PublicDB, PublicExecution } from '@aztec/acir-simulator';
import { BarretenbergWasm } from '@aztec/barretenberg.js/wasm';
import {
  ARGS_LENGTH,
  AztecAddress,
  EMITTED_EVENTS_LENGTH,
  EthAddress,
  Fr,
  NEW_L2_TO_L1_MSGS_LENGTH,
  PUBLIC_CALL_STACK_LENGTH,
  PublicCircuitPublicInputs,
  RETURN_VALUES_LENGTH,
  STATE_READS_LENGTH,
  STATE_TRANSITIONS_LENGTH,
  StateRead,
  StateTransition,
  TxRequest,
} from '@aztec/circuits.js';
import { MerkleTreeId, MerkleTreeOperations, computePublicDataTreeLeafIndex } from '@aztec/world-state';
import { PublicCircuitSimulator } from './index.js';

function padArray<T>(array: T[], element: T, requiredLength: number): T[] {
  const initialLength = array.length;
  array.push(...new Array<T>(requiredLength - initialLength).fill(element));
  return array;
}

/**
 * Emulates the PublicCircuit simulator by executing ACIR as if it were Brillig opcodes.
 */
export class FakePublicCircuitSimulator implements PublicCircuitSimulator {
  private readonly db: WorldStatePublicDB;

  constructor(private readonly merkleTree: MerkleTreeOperations) {
    this.db = new WorldStatePublicDB(this.merkleTree);
  }

  /**
   * Emulates a simulation of the public circuit for the given tx.
   * @param tx - Transaction request to execute.
   * @param functionBytecode - Bytecode (ACIR for now) of the function to run.
   * @param portalAddress - Corresponding portal address of the contract being run.
   * @returns The resulting PublicCircuitPublicInputs as if the circuit had been simulated.
   */
  public async publicCircuit(
    tx: TxRequest,
    functionBytecode: Buffer,
    portalAddress: EthAddress,
  ): Promise<PublicCircuitPublicInputs> {
    const publicDataTreeInfo = await this.merkleTree.getTreeInfo(MerkleTreeId.PUBLIC_DATA_TREE);
    const historicPublicDataTreeRoot = Fr.fromBuffer(publicDataTreeInfo.root);

    const execution = PublicExecution.fromTransactionRequest(this.db, tx, functionBytecode, portalAddress);

    // Pad arrays to reach required length
    const result = await execution.run();
    const args = tx.args;
    const { stateReads, stateTransitions, returnValues } = result;

    return PublicCircuitPublicInputs.from({
      args: padArray<Fr>(args, Fr.ZERO, ARGS_LENGTH),
      callContext: execution.callContext,
      emittedEvents: padArray([], Fr.ZERO, EMITTED_EVENTS_LENGTH),
      newL2ToL1Msgs: padArray([], Fr.ZERO, NEW_L2_TO_L1_MSGS_LENGTH),
      proverAddress: AztecAddress.random(),
      publicCallStack: padArray([], Fr.ZERO, PUBLIC_CALL_STACK_LENGTH),
      returnValues: padArray<Fr>(returnValues, Fr.ZERO, RETURN_VALUES_LENGTH),
      stateReads: padArray<StateRead>(stateReads, StateRead.empty(), STATE_READS_LENGTH),
      stateTransitions: padArray<StateTransition>(stateTransitions, StateTransition.empty(), STATE_TRANSITIONS_LENGTH),
      historicPublicDataTreeRoot,
    });
  }
}

/**
 * Implements the PublicDB using a world-state database.
 */
class WorldStatePublicDB implements PublicDB {
  constructor(private db: MerkleTreeOperations) {}

  /**
   * Reads a value from public storage, returning zero if none.
   * @param contract - Owner of the storage.
   * @param slot - Slot to read in the contract storage.
   * @returns The current value in the storage slot.
   */
  public async storageRead(contract: AztecAddress, slot: Fr): Promise<Fr> {
    const index = computePublicDataTreeLeafIndex(contract, slot, await BarretenbergWasm.get());
    const value = await this.db.getLeafValue(MerkleTreeId.PUBLIC_DATA_TREE, index);
    return value ? Fr.fromBuffer(value) : Fr.ZERO;
  }
}
