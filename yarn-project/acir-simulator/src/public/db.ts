import { AztecAddress, Fr } from '@aztec/foundation';

export interface PublicDB {
  /**
   * Reads a value from public storage, returning zero if none.
   * @param contract - owner of the storage.
   * @param slot - slot to read in the contract storage.
   * @returns The current value in the storage slot.
   */
  storageRead(contract: AztecAddress, slot: Fr): Promise<Fr>;
  /**
   * Writes a value to public storage, returning the previous value in that slot, or zero if none.
   * @param contract - owner of the storage.
   * @param slot - slot to write in the contract storage.
   * @param value - value to write.
   * @returns The **previous** value in the storage slot.
   */
  storageWrite(contract: AztecAddress, slot: Fr, value: Fr): Promise<Fr>;
}
