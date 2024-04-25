import { type Wallet } from '@aztec/aztec.js';
import { Aes128 } from '@aztec/circuits.js/barretenberg';
import { TestContract } from '@aztec/noir-contracts.js';

import { randomBytes } from 'crypto';

import { setup } from './fixtures/utils.js';

describe('e2e_encryption', () => {
  const aes128 = new Aes128();

  let wallet: Wallet;
  let teardown: () => Promise<void>;

  let contract: TestContract;

  beforeAll(async () => {
    ({ teardown, wallet } = await setup());
    contract = await TestContract.deploy(wallet).send().deployed();
  }, 25_000);

  afterAll(() => teardown());

  it('encrypts 🔒📄🔑💻', async () => {
    const input = randomBytes(64);
    const iv = randomBytes(16);
    const key = randomBytes(16);

    const expectedCiphertext = aes128.encryptBufferCBC(input, iv, key);

    const ciphertext = await contract.methods.encrypt(Array.from(input), Array.from(iv), Array.from(key)).simulate();

    expect(ciphertext).toEqual(expectedCiphertext);
  });
});
