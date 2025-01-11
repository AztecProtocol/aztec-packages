import { AztecAddress, CompleteAddress } from '@aztec/aztec.js';
import { TokenContract, type Transfer } from '@aztec/noir-contracts.js/Token';

import { TokenContractTest } from './token_contract_test.js';

describe('e2e_token_contract transfer private', () => {
  const t = new TokenContractTest('transfer_private');
  let { asset, accounts, tokenSim, wallets } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
    await t.setup();
    ({ asset, accounts, tokenSim, wallets } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it('transfer less than balance', async () => {
    const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
    const amount = balance0 / 2n;
    expect(amount).toBeGreaterThan(0n);

    // We give wallets[0] access to wallets[1]'s notes to be able to transfer the notes.
    wallets[0].setScopes([wallets[0].getAddress(), wallets[1].getAddress()]);

    const tx = await asset.methods.transfer(accounts[1].address, amount).send().wait();
    tokenSim.transferPrivate(accounts[0].address, accounts[1].address, amount);

    const events = await wallets[1].getEncryptedEvents<Transfer>(TokenContract.events.Transfer, tx.blockNumber!, 1);

    expect(events[0]).toEqual({
      from: accounts[0].address,
      to: accounts[1].address,
      amount: amount,
    });
  });

  it('transfer less than balance to non-deployed account', async () => {
    const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
    const amount = balance0 / 2n;
    expect(amount).toBeGreaterThan(0n);

    const nonDeployed = CompleteAddress.random();

    await asset.methods.transfer(nonDeployed.address, amount).send().wait();

    // Add the account as balance we should change, but since we don't have the key,
    // we cannot decrypt, and instead we simulate a transfer to address(0)
    tokenSim.addAccount(nonDeployed.address);
    tokenSim.transferPrivate(accounts[0].address, AztecAddress.ZERO, amount);
  });

  it('transfer to self', async () => {
    const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
    const amount = balance0 / 2n;
    expect(amount).toBeGreaterThan(0n);
    await asset.methods.transfer(accounts[0].address, amount).send().wait();
    tokenSim.transferPrivate(accounts[0].address, accounts[0].address, amount);
  });

  describe('failure cases', () => {
    it('transfer more than balance', async () => {
      const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
      const amount = balance0 + 1n;
      expect(amount).toBeGreaterThan(0n);
      await expect(asset.methods.transfer(accounts[1].address, amount).simulate()).rejects.toThrow(
        'Assertion failed: Balance too low',
      );
    });

    it.skip('transfer into account to overflow', () => {
      // This should already be covered by the mint case earlier. e.g., since we cannot mint to overflow, there is not
      // a way to get funds enough to overflow.
      // Require direct storage manipulation for us to perform a nice explicit case though.
      // See https://github.com/AztecProtocol/aztec-packages/issues/1259
    });
  });
});
