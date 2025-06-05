import { type AccountWalletWithSecretKey, AztecAddress, Fr } from '@aztec/aztec.js';
import { OffchainMessageContract } from '@aztec/noir-test-contracts.js/OffchainMessage';

import { jest } from '@jest/globals';

import { ensureAccountsPubliclyDeployed, setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

describe('e2e_offchain_message', () => {
  let contract: OffchainMessageContract;
  jest.setTimeout(TIMEOUT);

  let wallets: AccountWalletWithSecretKey[];
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({ teardown, wallets } = await setup(2));
    await ensureAccountsPubliclyDeployed(wallets[0], wallets.slice(0, 2));
    contract = await OffchainMessageContract.deploy(wallets[0]).send().deployed();
  });

  afterAll(() => teardown());

  it('should emit offchain message', async () => {
    const message = [Fr.random(), Fr.random(), Fr.random(), Fr.random(), Fr.random()];
    const recipient = await AztecAddress.random();

    const numRecursions = 3;

    const provenTx = await contract.methods
      .emit_offchain_message_for_recipient(message, recipient, numRecursions)
      .prove();

    const offchainMessages = provenTx.offchainMessages;
    expect(offchainMessages.length).toBe(4);
    for (let i = 0; i < offchainMessages.length; i++) {
      expect(offchainMessages[i].recipient).toEqual(recipient);
      expect(offchainMessages[i].message).toEqual(message);
    }
  });
});
