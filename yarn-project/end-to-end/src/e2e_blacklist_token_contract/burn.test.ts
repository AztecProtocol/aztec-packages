import { Fr, computeAuthWitMessageHash } from '@aztec/aztec.js';

import { DUPLICATE_NULLIFIER_ERROR, U128_UNDERFLOW_ERROR } from '../fixtures/index.js';
import { BlacklistTokenContractTest } from './blacklist_token_contract_test.js';

describe('e2e_blacklist_token_contract burn', () => {
  const t = new BlacklistTokenContractTest('burn');
  let { asset, tokenSim, wallets, blacklisted } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    // Beware that we are adding the admin as minter here, which is very slow because it needs multiple blocks.
    await t.applyMintSnapshot();
    await t.setup();
    // Have to destructure again to ensure we have latest refs.
    ({ asset, tokenSim, wallets, blacklisted } = t);
  }, 600_000);

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  describe('public', () => {
    it('burn less than balance', async () => {
      const balance0 = await asset.methods.balance_of_public(wallets[0].getAddress()).simulate();
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      await asset.methods.burn_public(wallets[0].getAddress(), amount, 0).send().wait();

      tokenSim.burnPublic(wallets[0].getAddress(), amount);
    });

    it('burn on behalf of other', async () => {
      const balance0 = await asset.methods.balance_of_public(wallets[0].getAddress()).simulate();
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      const authwitNonce = Fr.random();

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset.withWallet(wallets[1]).methods.burn_public(wallets[0].getAddress(), amount, authwitNonce);
      const validateActionInteraction = await wallets[0].setPublicAuthWit(
        { caller: wallets[1].getAddress(), action },
        true,
      );
      await validateActionInteraction.send().wait();

      await action.send().wait();

      tokenSim.burnPublic(wallets[0].getAddress(), amount);

      await expect(
        asset.withWallet(wallets[1]).methods.burn_public(wallets[0].getAddress(), amount, authwitNonce).simulate(),
      ).rejects.toThrow(/unauthorized/);
    });

    describe('failure cases', () => {
      it('burn more than balance', async () => {
        const balance0 = await asset.methods.balance_of_public(wallets[0].getAddress()).simulate();
        const amount = balance0 + 1n;
        const authwitNonce = 0;
        await expect(
          asset.methods.burn_public(wallets[0].getAddress(), amount, authwitNonce).simulate(),
        ).rejects.toThrow(U128_UNDERFLOW_ERROR);
      });

      it('burn on behalf of self with non-zero nonce', async () => {
        const balance0 = await asset.methods.balance_of_public(wallets[0].getAddress()).simulate();
        const amount = balance0 - 1n;
        expect(amount).toBeGreaterThan(0n);
        const authwitNonce = 1;
        await expect(
          asset.methods.burn_public(wallets[0].getAddress(), amount, authwitNonce).simulate(),
        ).rejects.toThrow(
          'Assertion failed: Invalid authwit nonce. When from and msg_sender are the same, authwit_nonce must be zero',
        );
      });

      it('burn on behalf of other without "approval"', async () => {
        const balance0 = await asset.methods.balance_of_public(wallets[0].getAddress()).simulate();
        const amount = balance0 + 1n;
        const authwitNonce = Fr.random();
        await expect(
          asset.withWallet(wallets[1]).methods.burn_public(wallets[0].getAddress(), amount, authwitNonce).simulate(),
        ).rejects.toThrow(/unauthorized/);
      });

      it('burn more than balance on behalf of other', async () => {
        const balance0 = await asset.methods.balance_of_public(wallets[0].getAddress()).simulate();
        const amount = balance0 + 1n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.withWallet(wallets[1]).methods.burn_public(wallets[0].getAddress(), amount, authwitNonce);
        const validateActionInteraction = await wallets[0].setPublicAuthWit(
          { caller: wallets[1].getAddress(), action },
          true,
        );
        await validateActionInteraction.send().wait();

        await expect(action.simulate()).rejects.toThrow(U128_UNDERFLOW_ERROR);
      });

      it('burn on behalf of other, wrong designated caller', async () => {
        const balance0 = await asset.methods.balance_of_public(wallets[0].getAddress()).simulate();
        const amount = balance0 + 2n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.withWallet(wallets[1]).methods.burn_public(wallets[0].getAddress(), amount, authwitNonce);
        const validateActionInteraction = await wallets[0].setPublicAuthWit(
          { caller: wallets[0].getAddress(), action },
          true,
        );
        await validateActionInteraction.send().wait();

        await expect(
          asset.withWallet(wallets[1]).methods.burn_public(wallets[0].getAddress(), amount, authwitNonce).simulate(),
        ).rejects.toThrow(/unauthorized/);
      });

      it('burn from blacklisted account', async () => {
        await expect(asset.methods.burn_public(blacklisted.getAddress(), 1n, 0).simulate()).rejects.toThrow(
          /Assertion failed: Blacklisted: Sender/,
        );
      });
    });
  });

  describe('private', () => {
    it('burn less than balance', async () => {
      const balance0 = await asset.methods.balance_of_private(wallets[0].getAddress()).simulate();
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      await asset.methods.burn(wallets[0].getAddress(), amount, 0).send().wait();
      tokenSim.burnPrivate(wallets[0].getAddress(), amount);
    });

    it('burn on behalf of other', async () => {
      const balance0 = await asset.methods.balance_of_private(wallets[0].getAddress()).simulate();
      const amount = balance0 / 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset.withWallet(wallets[1]).methods.burn(wallets[0].getAddress(), amount, authwitNonce);

      // Both wallets are connected to same node and PXE so we could just insert directly
      // But doing it in two actions to show the flow.
      const witness = await wallets[0].createAuthWit({ caller: wallets[1].getAddress(), action });

      await asset
        .withWallet(wallets[1])
        .methods.burn(wallets[0].getAddress(), amount, authwitNonce)
        .send({ authWitnesses: [witness] })
        .wait();
      tokenSim.burnPrivate(wallets[0].getAddress(), amount);

      // Perform the transfer again, should fail
      const txReplay = asset
        .withWallet(wallets[1])
        .methods.burn(wallets[0].getAddress(), amount, authwitNonce)
        .send({ authWitnesses: [witness] });
      await expect(txReplay.wait()).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
    });

    describe('failure cases', () => {
      it('burn more than balance', async () => {
        const balance0 = await asset.methods.balance_of_private(wallets[0].getAddress()).simulate();
        const amount = balance0 + 1n;
        expect(amount).toBeGreaterThan(0n);
        await expect(asset.methods.burn(wallets[0].getAddress(), amount, 0).simulate()).rejects.toThrow(
          'Assertion failed: Balance too low',
        );
      });

      it('burn on behalf of self with non-zero nonce', async () => {
        const balance0 = await asset.methods.balance_of_private(wallets[0].getAddress()).simulate();
        const amount = balance0 - 1n;
        expect(amount).toBeGreaterThan(0n);
        await expect(asset.methods.burn(wallets[0].getAddress(), amount, 1).simulate()).rejects.toThrow(
          'Assertion failed: Invalid authwit nonce. When from and msg_sender are the same, authwit_nonce must be zero',
        );
      });

      it('burn more than balance on behalf of other', async () => {
        const balance0 = await asset.methods.balance_of_private(wallets[0].getAddress()).simulate();
        const amount = balance0 + 1n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.withWallet(wallets[1]).methods.burn(wallets[0].getAddress(), amount, authwitNonce);

        // Both wallets are connected to same node and PXE so we could just insert directly
        // But doing it in two actions to show the flow.
        const witness = await wallets[0].createAuthWit({ caller: wallets[1].getAddress(), action });

        await expect(action.simulate({ authWitnesses: [witness] })).rejects.toThrow(
          'Assertion failed: Balance too low',
        );
      });

      it('burn on behalf of other without approval', async () => {
        const balance0 = await asset.methods.balance_of_private(wallets[0].getAddress()).simulate();
        const amount = balance0 / 2n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.withWallet(wallets[1]).methods.burn(wallets[0].getAddress(), amount, authwitNonce);
        const messageHash = await computeAuthWitMessageHash(
          { caller: wallets[1].getAddress(), action },
          { chainId: wallets[0].getChainId(), version: wallets[0].getVersion() },
        );

        await expect(action.simulate()).rejects.toThrow(
          `Unknown auth witness for message hash ${messageHash.toString()}`,
        );
      });

      it('on behalf of other (invalid designated caller)', async () => {
        const balancePriv0 = await asset.methods.balance_of_private(wallets[0].getAddress()).simulate();
        const amount = balancePriv0 + 2n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.withWallet(wallets[2]).methods.burn(wallets[0].getAddress(), amount, authwitNonce);
        const expectedMessageHash = await computeAuthWitMessageHash(
          { caller: wallets[2].getAddress(), action },
          { chainId: wallets[0].getChainId(), version: wallets[0].getVersion() },
        );

        const witness = await wallets[0].createAuthWit({ caller: wallets[1].getAddress(), action });

        await expect(action.simulate({ authWitnesses: [witness] })).rejects.toThrow(
          `Unknown auth witness for message hash ${expectedMessageHash.toString()}`,
        );
      });

      it('burn from blacklisted account', async () => {
        await expect(asset.methods.burn(blacklisted.getAddress(), 1n, 0).simulate()).rejects.toThrow(
          'Assertion failed: Blacklisted: Sender',
        );
      });
    });
  });
});
