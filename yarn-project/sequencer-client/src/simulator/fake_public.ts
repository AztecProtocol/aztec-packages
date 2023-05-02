import { PublicDB, PublicExecution } from '@aztec/acir-simulator';
import { BarretenbergWasm } from '@aztec/barretenberg.js/wasm';
import {
  ARGS_LENGTH,
  AztecAddress,
  EMITTED_EVENTS_LENGTH,
  EthAddress,
  Fr,
  L1_MSG_STACK_LENGTH,
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

    // Pad args array to reach ARGS_LENGTH
    const result = await execution.run();
    const args = tx.args;
    args.push(...new Array<Fr>(ARGS_LENGTH - tx.args.length).fill(Fr.ZERO));

    const { stateReads, stateTransitions, returnValues } = result;
    returnValues.push(...new Array<Fr>(RETURN_VALUES_LENGTH - result.returnValues.length).fill(Fr.ZERO));
    stateReads.push(...new Array<StateRead>(STATE_READS_LENGTH - result.stateReads.length).fill(StateRead.empty()));
    stateTransitions.push(
      ...new Array<StateTransition>(STATE_TRANSITIONS_LENGTH - result.stateTransitions.length).fill(
        StateTransition.empty(),
      ),
    );

    return PublicCircuitPublicInputs.from({
      args,
      callContext: execution.callContext,
      emittedEvents: new Array<Fr>(EMITTED_EVENTS_LENGTH).fill(Fr.ZERO),
      l1MsgStack: new Array<Fr>(L1_MSG_STACK_LENGTH).fill(Fr.ZERO),
      proverAddress: AztecAddress.random(),
      publicCallStack: new Array<Fr>(PUBLIC_CALL_STACK_LENGTH).fill(Fr.ZERO),
      returnValues,
      stateReads,
      stateTransitions,
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
