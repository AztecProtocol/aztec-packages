import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { KVPxeDatabase } from '@aztec/pxe';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { CompleteAddress } from '@aztec/stdlib/contract';

export class TXEDatabase extends KVPxeDatabase {
  #accounts: AztecAsyncMap<string, Buffer>;

  constructor(db: AztecAsyncKVStore) {
    super(db);
    this.#accounts = db.openMap('accounts');
  }

  async getAccount(key: AztecAddress) {
    const completeAddress = await this.#accounts.getAsync(key.toString());
    if (!completeAddress) {
      throw new Error(`Account not found: ${key.toString()}`);
    }
    return CompleteAddress.fromBuffer(completeAddress);
  }

  async setAccount(key: AztecAddress, value: CompleteAddress) {
    await this.#accounts.set(key.toString(), value.toBuffer());
    await this.addCompleteAddress(value);
  }
}
