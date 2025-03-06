import { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';

import type { DataProvider } from '../data_provider.js';

export class AuthWitnessDataProvider implements DataProvider {
  #store: AztecAsyncKVStore;
  #authWitnesses: AztecAsyncMap<string, Buffer[]>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#authWitnesses = this.#store.openMap('auth_witnesses');
  }

  async addAuthWitness(messageHash: Fr, witness: Fr[]): Promise<void> {
    await this.#authWitnesses.set(
      messageHash.toString(),
      witness.map(w => w.toBuffer()),
    );
  }

  async getAuthWitness(messageHash: Fr): Promise<Fr[] | undefined> {
    const witness = await this.#authWitnesses.getAsync(messageHash.toString());
    return witness?.map(w => Fr.fromBuffer(w));
  }

  async getSize(): Promise<number> {
    return (await toArray(this.#authWitnesses.valuesAsync())).reduce(
      (sum, value) => sum + value.length * Fr.SIZE_IN_BYTES,
      0,
    );
  }
}
