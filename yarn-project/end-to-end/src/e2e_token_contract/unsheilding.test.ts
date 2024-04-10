import { Fr, computeAuthWitMessageHash } from '@aztec/aztec.js';

import { TestClass } from './test_class.js';

// const { E2E_DATA_PATH: dataPath = './data' } = process.env;

describe('e2e_token_contract', () => {
  const t = new TestClass('unshielding');
  let { asset, accounts, tokenSim, wallets } = t;

  beforeAll(async () => {
    await t.setup();
    await t.addTransferSnapshot();
  });

  beforeEach(async () => {
    await t.snapshotManager.setup();
    // Have to destructure again to ensure we have latest refs.
    ({ asset, accounts, tokenSim, wallets } = t);
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  afterAll(async () => {
    await t.snapshotManager.teardown();
  });

  describe('Unshielding', () => {
    it('on behalf of self', async () => {
      const balancePriv = await asset.methods.balance_of_private(accounts[0].address).view();
      const amount = balancePriv / 2n;
      expect(amount).toBeGreaterThan(0n);

      await asset.methods.unshield(accounts[0].address, accounts[0].address, amount, 0).send().wait();

      tokenSim.unshield(accounts[0].address, accounts[0].address, amount);
    });

    it('on behalf of other', async () => {
      const balancePriv0 = await asset.methods.balance_of_private(accounts[0].address).view();
      const amount = balancePriv0 / 2n;
      const nonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset
        .withWallet(wallets[1])
        .methods.unshield(accounts[0].address, accounts[1].address, amount, nonce);

      // Both wallets are connected to same node and PXE so we could just insert directly
      // But doing it in two actions to show the flow.
      const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
      await wallets[1].addAuthWitness(witness);

      await action.send().wait();
      tokenSim.unshield(accounts[0].address, accounts[1].address, amount);

      // Perform the transfer again, should fail
      const txReplay = asset
        .withWallet(wallets[1])
        .methods.unshield(accounts[0].address, accounts[1].address, amount, nonce)
        .send();
      await expect(txReplay.wait()).rejects.toThrow('Transaction ');
    });

    describe('failure cases', () => {
      it('on behalf of self (more than balance)', async () => {
        const balancePriv = await asset.methods.balance_of_private(accounts[0].address).view();
        const amount = balancePriv + 1n;
        expect(amount).toBeGreaterThan(0n);

        await expect(
          asset.methods.unshield(accounts[0].address, accounts[0].address, amount, 0).simulate(),
        ).rejects.toThrow('Assertion failed: Balance too low');
      });

      it('on behalf of self (invalid nonce)', async () => {
        const balancePriv = await asset.methods.balance_of_private(accounts[0].address).view();
        const amount = balancePriv + 1n;
        expect(amount).toBeGreaterThan(0n);

        await expect(
          asset.methods.unshield(accounts[0].address, accounts[0].address, amount, 1).simulate(),
        ).rejects.toThrow('Assertion failed: invalid nonce');
      });

      it('on behalf of other (more than balance)', async () => {
        const balancePriv0 = await asset.methods.balance_of_private(accounts[0].address).view();
        const amount = balancePriv0 + 2n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset
          .withWallet(wallets[1])
          .methods.unshield(accounts[0].address, accounts[1].address, amount, nonce);

        // Both wallets are connected to same node and PXE so we could just insert directly
        // But doing it in two actions to show the flow.
        const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
        await wallets[1].addAuthWitness(witness);

        await expect(action.simulate()).rejects.toThrow('Assertion failed: Balance too low');
      });

      it('on behalf of other (invalid designated caller)', async () => {
        const balancePriv0 = await asset.methods.balance_of_private(accounts[0].address).view();
        const amount = balancePriv0 + 2n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset
          .withWallet(wallets[2])
          .methods.unshield(accounts[0].address, accounts[1].address, amount, nonce);
        const expectedMessageHash = computeAuthWitMessageHash(
          accounts[2].address,
          wallets[0].getChainId(),
          wallets[0].getVersion(),
          action.request(),
        );

        // Both wallets are connected to same node and PXE so we could just insert directly
        // But doing it in two actions to show the flow.
        const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
        await wallets[2].addAuthWitness(witness);

        await expect(action.simulate()).rejects.toThrow(
          `Unknown auth witness for message hash ${expectedMessageHash.toString()}`,
        );
      });
    });
  });
});
