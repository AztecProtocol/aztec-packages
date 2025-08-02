import { Fr, computeAuthWitMessageHash } from '@aztec/aztec.js';

import { DUPLICATE_NULLIFIER_ERROR, U128_UNDERFLOW_ERROR } from '../fixtures/index.js';
import { TokenContractTest } from './token_contract_test.js';

describe('e2e_token_contract burn', () => {
  const t = new TokenContractTest('burn');
  let { asset, accounts, tokenSim, wallets } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
    await t.setup();
    // Have to destructure again to ensure we have latest refs.
    ({ asset, accounts, tokenSim, wallets } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  describe('public', () => {
    it('burn less than balance', async () => {
      const balance0 = await asset.methods.balance_of_public(accounts[0].address).simulate();
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      await asset.methods.burn_public(accounts[0].address, amount, 0).send().wait();

      tokenSim.burnPublic(accounts[0].address, amount);
    });

    it('burn on behalf of other', async () => {
      const balance0 = await asset.methods.balance_of_public(accounts[0].address).simulate();
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      const authwitNonce = Fr.random();

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset.withWallet(wallets[1]).methods.burn_public(accounts[0].address, amount, authwitNonce);
      const validateActionInteraction = await wallets[0].setPublicAuthWit(
        { caller: accounts[1].address, action },
        true,
      );
      await validateActionInteraction.send().wait();

      await action.send().wait();

      tokenSim.burnPublic(accounts[0].address, amount);

      await expect(
        asset.withWallet(wallets[1]).methods.burn_public(accounts[0].address, amount, authwitNonce).simulate(),
      ).rejects.toThrow(/unauthorized/);
    });

    describe('failure cases', () => {
      it('burn more than balance', async () => {
        const balance0 = await asset.methods.balance_of_public(accounts[0].address).simulate();
        const amount = balance0 + 1n;
        const authwitNonce = 0;
        await expect(asset.methods.burn_public(accounts[0].address, amount, authwitNonce).simulate()).rejects.toThrow(
          U128_UNDERFLOW_ERROR,
        );
      });

      it('burn on behalf of self with non-zero nonce', async () => {
        const balance0 = await asset.methods.balance_of_public(accounts[0].address).simulate();
        const amount = balance0 - 1n;
        expect(amount).toBeGreaterThan(0n);
        const authwitNonce = 1;
        await expect(asset.methods.burn_public(accounts[0].address, amount, authwitNonce).simulate()).rejects.toThrow(
          "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero",
        );
      });

      it('burn on behalf of other without "approval"', async () => {
        const balance0 = await asset.methods.balance_of_public(accounts[0].address).simulate();
        const amount = balance0 + 1n;
        const authwitNonce = Fr.random();
        await expect(
          asset.withWallet(wallets[1]).methods.burn_public(accounts[0].address, amount, authwitNonce).simulate(),
        ).rejects.toThrow(/unauthorized/);
      });

      it('burn more than balance on behalf of other', async () => {
        const balance0 = await asset.methods.balance_of_public(accounts[0].address).simulate();
        const amount = balance0 + 1n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.withWallet(wallets[1]).methods.burn_public(accounts[0].address, amount, authwitNonce);
        const validateActionInteraction = await wallets[0].setPublicAuthWit(
          { caller: accounts[1].address, action },
          true,
        );
        await validateActionInteraction.send().wait();

        await expect(action.simulate()).rejects.toThrow(U128_UNDERFLOW_ERROR);
      });

      it('burn on behalf of other, wrong designated caller', async () => {
        const balance0 = await asset.methods.balance_of_public(accounts[0].address).simulate();
        const amount = balance0 + 2n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.withWallet(wallets[1]).methods.burn_public(accounts[0].address, amount, authwitNonce);
        const validateActionInteraction = await wallets[0].setPublicAuthWit(
          { caller: accounts[0].address, action },
          true,
        );
        await validateActionInteraction.send().wait();

        await expect(
          asset.withWallet(wallets[1]).methods.burn_public(accounts[0].address, amount, authwitNonce).simulate(),
        ).rejects.toThrow(/unauthorized/);
      });
    });
  });

  describe('private', () => {
    it('burn less than balance', async () => {
      const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      await asset.methods.burn_private(accounts[0].address, amount, 0).send().wait();
      tokenSim.burnPrivate(accounts[0].address, amount);
    });

    it('burn on behalf of other', async () => {
      const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
      const amount = balance0 / 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset.withWallet(wallets[1]).methods.burn_private(accounts[0].address, amount, authwitNonce);

      // Both wallets are connected to same node and PXE so we could just insert directly
      // But doing it in two actions to show the flow.
      const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });

      await asset
        .withWallet(wallets[1])
        .methods.burn_private(accounts[0].address, amount, authwitNonce)
        .send({ authWitnesses: [witness] })
        .wait();
      tokenSim.burnPrivate(accounts[0].address, amount);

      // Perform the transfer again, should fail
      const txReplay = asset
        .withWallet(wallets[1])
        .methods.burn_private(accounts[0].address, amount, authwitNonce)
        .send({ authWitnesses: [witness] });
      await expect(txReplay.wait()).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
    });

    describe('failure cases', () => {
      it('burn more than balance', async () => {
        const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
        const amount = balance0 + 1n;
        expect(amount).toBeGreaterThan(0n);
        await expect(asset.methods.burn_private(accounts[0].address, amount, 0).simulate()).rejects.toThrow(
          'Assertion failed: Balance too low',
        );
      });

      it('burn on behalf of self with non-zero nonce', async () => {
        const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
        const amount = balance0 - 1n;
        expect(amount).toBeGreaterThan(0n);
        await expect(asset.methods.burn_private(accounts[0].address, amount, 1).simulate()).rejects.toThrow(
          "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero",
        );
      });

      it('burn more than balance on behalf of other', async () => {
        const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
        const amount = balance0 + 1n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.withWallet(wallets[1]).methods.burn_private(accounts[0].address, amount, authwitNonce);

        // Both wallets are connected to same node and PXE so we could just insert directly
        // But doing it in two actions to show the flow.
        const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });

        await expect(action.simulate({ authWitnesses: [witness] })).rejects.toThrow(
          'Assertion failed: Balance too low',
        );
      });

      it('burn on behalf of other without approval', async () => {
        const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
        const amount = balance0 / 2n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.withWallet(wallets[1]).methods.burn_private(accounts[0].address, amount, authwitNonce);
        const messageHash = await computeAuthWitMessageHash(
          { caller: accounts[1].address, action },
          { chainId: wallets[0].getChainId(), version: wallets[0].getVersion() },
        );

        await expect(action.simulate()).rejects.toThrow(
          `Unknown auth witness for message hash ${messageHash.toString()}`,
        );
      });

      it('on behalf of other (invalid designated caller)', async () => {
        const balancePriv0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
        const amount = balancePriv0 + 2n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.withWallet(wallets[2]).methods.burn_private(accounts[0].address, amount, authwitNonce);
        const expectedMessageHash = await computeAuthWitMessageHash(
          { caller: accounts[2].address, action },
          { chainId: wallets[0].getChainId(), version: wallets[0].getVersion() },
        );

        const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });

        await expect(action.simulate({ authWitnesses: [witness] })).rejects.toThrow(
          `Unknown auth witness for message hash ${expectedMessageHash.toString()}`,
        );
      });
    });
  });
});
