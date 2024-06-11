import { type AztecAddress, CompleteAddress } from '@aztec/circuits.js';
import { type AztecKVStore, type AztecMap } from '@aztec/kv-store';

export class AccountStore {
  #accounts: AztecMap<string, Buffer>;

  constructor(database: AztecKVStore) {
    this.#accounts = database.openMap('accounts');
  }

  getAccount(key: AztecAddress) {
    const completeAddress = this.#accounts.get(key.toString());
    return CompleteAddress.fromBuffer(completeAddress!);
  }

  async setAccount(key: AztecAddress, value: CompleteAddress) {
    await this.#accounts.set(key.toString(), value.toBuffer());
  }
}
