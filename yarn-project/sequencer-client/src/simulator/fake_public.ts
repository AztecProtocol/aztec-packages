import { PublicDB, PublicExecution, computeSlot } from '@aztec/acir-simulator';
import { BarretenbergWasm } from '@aztec/barretenberg.js/wasm';
import { AztecAddress, EthAddress, Fr, PublicCircuitPublicInputs, TxRequest } from '@aztec/circuits.js';
import { FunctionAbi } from '@aztec/noir-contracts';
import { MerkleTreeId, MerkleTreeOperations } from '@aztec/world-state';
import { PublicCircuitSimulator } from './index.js';

export class FakePublicCircuitSimulator implements PublicCircuitSimulator {
  public readonly db: WorldStatePublicDB;

  constructor(merkleTree: MerkleTreeOperations) {
    this.db = new WorldStatePublicDB(merkleTree);
  }

  public async publicCircuit(tx: TxRequest): Promise<PublicCircuitPublicInputs> {
    const functionAbi: FunctionAbi = undefined as any;
    const portalAddress: EthAddress = undefined as any;

    const execution = PublicExecution.fromTransactionRequest(this.db, tx, functionAbi, portalAddress);
    const result = await execution.run();
    return PublicCircuitPublicInputs.from({
      args: tx.args,
      callContext: execution.callContext,
      emittedEvents: [],
      l1MsgStack: [],
      proverAddress: AztecAddress.random(),
      publicCallStack: [],
      returnValues: result.returnValues,
      stateReads: result.stateReads,
      stateTransitions: result.stateTransitions,
    });
  }
}

class WorldStatePublicDB implements PublicDB {
  constructor(private db: MerkleTreeOperations) {}

  public async storageRead(contract: AztecAddress, slot: Fr): Promise<Fr> {
    const index = computeSlot(slot, contract.toField(), await BarretenbergWasm.get()).value;
    const value = await this.db.getLeafValue(MerkleTreeId.PUBLIC_DATA_TREE, index);
    return value ? Fr.fromBuffer(value) : Fr.ZERO;
  }
}
