import { type AztecAddress, type ContractInstanceWithAddress, SerializableContractInstance } from '@aztec/circuits.js';
import { type AztecKVStore, type AztecMap } from '@aztec/kv-store';

/**
 * LMDB implementation of the ArchiverDataStore interface.
 */
export class ContractInstanceStore {
  #contractInstances: AztecMap<string, Buffer>;

  constructor(db: AztecKVStore) {
    this.#contractInstances = db.openMap('archiver_contract_instances');
  }

  addContractInstance(contractInstance: ContractInstanceWithAddress): Promise<void> {
    return this.#contractInstances.set(
      contractInstance.address.toString(),
      new SerializableContractInstance(contractInstance).toBuffer(),
    );
  }

  deleteContractInstance(contractInstance: ContractInstanceWithAddress): Promise<void> {
    return this.#contractInstances.delete(contractInstance.address.toString());
  }

  getContractInstance(address: AztecAddress): ContractInstanceWithAddress | undefined {
    const contractInstance = this.#contractInstances.get(address.toString());
    return contractInstance && SerializableContractInstance.fromBuffer(contractInstance).withAddress(address);
  }
}
