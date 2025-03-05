import { Fr } from '@aztec/foundation/fields';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';

export class AuthWitnessDataProvider {
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
    return Promise.resolve(witness?.map(w => Fr.fromBuffer(w)));
  }
}
