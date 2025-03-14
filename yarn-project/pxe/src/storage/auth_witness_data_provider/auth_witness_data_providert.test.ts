import { Fr } from '@aztec/foundation/fields';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { AuthWitnessDataProvider } from './auth_witness_data_provider.js';

describe('auth witnesses', () => {
  let authWitnessDataProvider: AuthWitnessDataProvider;

  beforeEach(async () => {
    const store = await openTmpStore('auth_witness_data_provider_test');
    authWitnessDataProvider = new AuthWitnessDataProvider(store);
  });
  it('stores and retrieves auth witnesses', async () => {
    const messageHash = Fr.random();
    const witness = [Fr.random(), Fr.random()];

    await authWitnessDataProvider.addAuthWitness(messageHash, witness);
    await expect(authWitnessDataProvider.getAuthWitness(messageHash)).resolves.toEqual(witness);
  });

  it("returns undefined if it doesn't have auth witnesses for the message", async () => {
    const messageHash = Fr.random();
    await expect(authWitnessDataProvider.getAuthWitness(messageHash)).resolves.toBeUndefined();
  });

  it.skip('refuses to overwrite auth witnesses for the same message', async () => {
    const messageHash = Fr.random();
    const witness = [Fr.random(), Fr.random()];

    await authWitnessDataProvider.addAuthWitness(messageHash, witness);
    await expect(authWitnessDataProvider.addAuthWitness(messageHash, witness)).rejects.toThrow();
  });
});
