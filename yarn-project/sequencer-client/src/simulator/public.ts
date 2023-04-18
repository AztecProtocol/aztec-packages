import { PublicDB, PublicExecution, computeSlot } from '@aztec/acir-simulator';
import { BarretenbergWasm } from '@aztec/barretenberg.js/wasm';
import { AztecAddress, EthAddress, Fr, PublicCircuitPublicInputs, TxRequest } from '@aztec/circuits.js';
import { MerkleTreeId, MerkleTreeOperations } from '@aztec/world-state';
import { PublicCircuitSimulator } from './index.js';
import { FunctionAbi } from '@aztec/noir-contracts';

export class FakePublicCircuitSimulator implements PublicCircuitSimulator {
  private db: WorldStatePublicDB;

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

  private async getIndex(contract: AztecAddress, slot: Fr) {
    const index = computeSlot(slot, contract.toField(), await BarretenbergWasm.get());
    return index.value;
  }

  public async storageRead(contract: AztecAddress, slot: Fr): Promise<Fr> {
    const value = await this.db.getLeafValue(MerkleTreeId.PUBLIC_DATA_TREE, await this.getIndex(contract, slot));
    if (!value) return Fr.ZERO;
    return Fr.fromBuffer(value);
  }

  public async storageWrite(contract: AztecAddress, slot: Fr, value: Fr): Promise<Fr> {
    const index = await this.getIndex(contract, slot);
    const oldValue = await this.db.getLeafValue(MerkleTreeId.PUBLIC_DATA_TREE, index);
    // TODO: Update leaf once the interface is available
    // await this.db.updateLeaf(MerkleTreeId.PUBLIC_DATA_TREE, value.toBuffer(), index);
    if (!oldValue) return Fr.ZERO;
    return Fr.fromBuffer(oldValue);
  }
}
