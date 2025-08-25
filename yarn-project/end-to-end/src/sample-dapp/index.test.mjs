// docs:start:imports
import { getDeployedTestAccountsWallets } from '@aztec/accounts/testing';
import { createPXEClient, waitForPXE } from '@aztec/aztec.js';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

// docs:end:imports

const { PXE_URL = 'http://localhost:8080' } = process.env;

// Note: To run this test you need to spin up Aztec sandbox. Build the aztec image (or pull it with aztec-up if on
// master) and then run this test as usual (yarn test src/sample-dapp/index.test.mjs).
describe('token', () => {
  // docs:start:setup
  let owner, recipient, token;

  beforeAll(async () => {
    const pxe = createPXEClient(PXE_URL);
    await waitForPXE(pxe);
    [owner, recipient] = await getDeployedTestAccountsWallets(pxe);

    const initialBalance = 69;
    token = await TokenContract.deploy(owner, owner.getAddress(), 'TokenName', 'TokenSymbol', 18)
      .send({ from: owner.getAddress() })
      .deployed();
    await token.methods.mint_to_private(owner.getAddress(), initialBalance).send({ from: owner.getAddress() }).wait();
  }, 120_000);
  // docs:end:setup

  // docs:start:test
  it('increases recipient funds on transfer', async () => {
    expect(
      await token
        .withWallet(recipient)
        .methods.balance_of_private(recipient.getAddress())
        .simulate({ from: recipient.getAddress() }),
    ).toEqual(0n);
    await token.methods.transfer(recipient.getAddress(), 20).send({ from: owner.getAddress() }).wait();
    expect(
      await token
        .withWallet(recipient)
        .methods.balance_of_private(recipient.getAddress())
        .simulate({ from: recipient.getAddress() }),
    ).toEqual(20n);
  }, 30_000);
  // docs:end:test
});
