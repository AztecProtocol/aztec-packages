import { createAccount } from '@aztec/accounts/testing';
import { createLogger, createPXEClient, waitForPXE } from '@aztec/aztec.js';

import { deployToken } from '../fixtures/token_utils';

const { PXE_URL = 'http://localhost:8080', ETHEREUM_HOST = 'http://localhost:8545' } = process.env;

// Note: To run this test you need to spin up Aztec sandbox. Build the aztec image (or pull it with aztec-up if on
// master) and then run this test as usual (yarn test src/sample-dapp/index.test.mjs).
describe('token', () => {
  // docs:start:setup
  let owner, recipient, token;

  beforeAll(async () => {
    const pxe = createPXEClient(PXE_URL);
    await waitForPXE(pxe);
    owner = await createAccount(pxe);
    recipient = await createAccount(pxe);

    const initialBalance = 69;
    token = await deployToken(owner, initialBalance, createLogger('sample_dapp'));
  }, 120_000);
  // docs:end:setup

  // docs:start:test
  it('increases recipient funds on transfer', async () => {
    expect(await token.withWallet(recipient).methods.balance_of_private(recipient.getAddress()).simulate()).toEqual(0n);
    await token.methods.transfer(recipient.getAddress(), 20).send().wait();
    expect(await token.withWallet(recipient).methods.balance_of_private(recipient.getAddress()).simulate()).toEqual(
      20n,
    );
  }, 30_000);
  // docs:end:test
});
