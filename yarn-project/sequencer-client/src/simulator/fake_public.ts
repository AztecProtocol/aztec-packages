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

export class FakePublicCircuitSimulator implements PublicCircuitSimulator {
  public readonly db: WorldStatePublicDB;

  constructor(private readonly merkleTree: MerkleTreeOperations) {
    this.db = new WorldStatePublicDB(this.merkleTree);
  }

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

class WorldStatePublicDB implements PublicDB {
  constructor(private db: MerkleTreeOperations) {}

  public async storageRead(contract: AztecAddress, slot: Fr): Promise<Fr> {
    const index = computePublicDataTreeLeafIndex(contract, slot, await BarretenbergWasm.get());
    const value = await this.db.getLeafValue(MerkleTreeId.PUBLIC_DATA_TREE, index);
    return value ? Fr.fromBuffer(value) : Fr.ZERO;
  }
}
