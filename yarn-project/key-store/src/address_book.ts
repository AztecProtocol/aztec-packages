import {
  Fr,
  type AztecAddress,
  type PartialAddress,
} from '@aztec/circuits.js';
import { type AddressBook } from '@aztec/circuit-types';
import { AztecKVStore, AztecMap } from '@aztec/kv-store';


export class KVAddressBook implements AddressBook {
  #addressMetadata: AztecMap<string, Buffer>;

  constructor(database: AztecKVStore) {
    this.#addressMetadata = database.openMap('address_book');
  }

  public async addPartialAddress(partialAddress: PartialAddress, address: AztecAddress) {
    await this.#addressMetadata.set(address.toString(), partialAddress.toBuffer());
  }

  getPartialAddress(address: AztecAddress): PartialAddress | undefined {
    const partialBuf = this.#addressMetadata.get(address.toString());
    return partialBuf === undefined ? undefined : Fr.fromBuffer(partialBuf);
  };
}