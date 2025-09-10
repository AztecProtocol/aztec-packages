import { AztecAddress, CompleteAddress } from '@aztec/aztec.js';
import { TokenContract, type Transfer } from '@aztec/noir-contracts.js/Token';

import { TokenContractTest } from './token_contract_test.js';

describe('e2e_token_contract transfer private', () => {
  const t = new TokenContractTest('transfer_private');
  let { asset, adminAddress, wallet, account1Address, tokenSim } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
    await t.setup();
    ({ asset, adminAddress, wallet, account1Address, tokenSim } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it('transfer less than balance', async () => {
    const balance0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
    const amount = balance0 / 2n;
    expect(amount).toBeGreaterThan(0n);

    const tx = await asset.methods.transfer(account1Address, amount).send({ from: adminAddress }).wait();
    tokenSim.transferPrivate(adminAddress, account1Address, amount);

    const events = await wallet.getPrivateEvents<Transfer>(
      asset.address,
      TokenContract.events.Transfer,
      tx.blockNumber!,
      1,
      [account1Address],
    );

    expect(events[0]).toEqual({
      from: adminAddress,
      to: account1Address,
      amount: amount,
    });
  });

  it('transfer less than balance to non-deployed account', async () => {
    const balance0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
    const amount = balance0 / 2n;
    expect(amount).toBeGreaterThan(0n);

    const nonDeployed = await CompleteAddress.random();

    await asset.methods.transfer(nonDeployed.address, amount).send({ from: adminAddress }).wait();

    // Add the account as balance we should change, but since we don't have the key,
    // we cannot decrypt, and instead we simulate a transfer to address(0)
    tokenSim.addAccount(nonDeployed.address);
    tokenSim.transferPrivate(adminAddress, AztecAddress.ZERO, amount);
  });

  it('transfer to self', async () => {
    const balance0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
    const amount = balance0 / 2n;
    expect(amount).toBeGreaterThan(0n);
    await asset.methods.transfer(adminAddress, amount).send({ from: adminAddress }).wait();
    tokenSim.transferPrivate(adminAddress, adminAddress, amount);
  });

  describe('failure cases', () => {
    it('transfer more than balance', async () => {
      const balance0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
      const amount = balance0 + 1n;
      expect(amount).toBeGreaterThan(0n);
      await expect(asset.methods.transfer(account1Address, amount).simulate({ from: adminAddress })).rejects.toThrow(
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
