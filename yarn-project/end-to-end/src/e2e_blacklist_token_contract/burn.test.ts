import { Fr, computeAuthWitMessageHash } from '@aztec/aztec.js';

import { DUPLICATE_NULLIFIER_ERROR, U128_UNDERFLOW_ERROR } from '../fixtures/index.js';
import { BlacklistTokenContractTest } from './blacklist_token_contract_test.js';

describe('e2e_blacklist_token_contract burn', () => {
  const t = new BlacklistTokenContractTest('burn');
  let { asset, tokenSim, wallet, adminAddress, otherAddress, blacklistedAddress } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    // Beware that we are adding the wallet as minter here, which is very slow because it needs multiple blocks.
    await t.applyMintSnapshot();
    await t.setup();
    // Have to destructure again to ensure we have latest refs.
    ({ asset, tokenSim, wallet, adminAddress, otherAddress, blacklistedAddress } = t);
  }, 600_000);

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  describe('public', () => {
    it('burn less than balance', async () => {
      const balance0 = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      await asset.methods.burn_public(adminAddress, amount, 0).send({ from: adminAddress }).wait();

      tokenSim.burnPublic(adminAddress, amount);
    });

    it('burn on behalf of other', async () => {
      const balance0 = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      const authwitNonce = Fr.random();

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset.methods.burn_public(adminAddress, amount, authwitNonce);
      const validateActionInteraction = await wallet.setPublicAuthWit(
        adminAddress,
        { caller: otherAddress, action },
        true,
      );
      await validateActionInteraction.send().wait();

      await action.send({ from: otherAddress }).wait();

      tokenSim.burnPublic(adminAddress, amount);

      await expect(
        asset.methods.burn_public(adminAddress, amount, authwitNonce).simulate({ from: otherAddress }),
      ).rejects.toThrow(/unauthorized/);
    });

    describe('failure cases', () => {
      it('burn more than balance', async () => {
        const balance0 = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
        const amount = balance0 + 1n;
        const authwitNonce = 0;
        await expect(
          asset.methods.burn_public(adminAddress, amount, authwitNonce).simulate({ from: adminAddress }),
        ).rejects.toThrow(U128_UNDERFLOW_ERROR);
      });

      it('burn on behalf of self with non-zero nonce', async () => {
        const balance0 = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
        const amount = balance0 - 1n;
        expect(amount).toBeGreaterThan(0n);
        const authwitNonce = 1;
        await expect(
          asset.methods.burn_public(adminAddress, amount, authwitNonce).simulate({ from: adminAddress }),
        ).rejects.toThrow(
          "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero",
        );
      });

      it('burn on behalf of other without "approval"', async () => {
        const balance0 = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
        const amount = balance0 + 1n;
        const authwitNonce = Fr.random();
        await expect(
          asset.methods.burn_public(adminAddress, amount, authwitNonce).simulate({ from: otherAddress }),
        ).rejects.toThrow(/unauthorized/);
      });

      it('burn more than balance on behalf of other', async () => {
        const balance0 = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
        const amount = balance0 + 1n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.methods.burn_public(adminAddress, amount, authwitNonce);
        const validateActionInteraction = await wallet.setPublicAuthWit(
          adminAddress,
          { caller: otherAddress, action },
          true,
        );
        await validateActionInteraction.send().wait();

        await expect(action.simulate({ from: otherAddress })).rejects.toThrow(U128_UNDERFLOW_ERROR);
      });

      it('burn on behalf of other, wrong designated caller', async () => {
        const balance0 = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
        const amount = balance0 + 2n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.methods.burn_public(adminAddress, amount, authwitNonce);
        const validateActionInteraction = await wallet.setPublicAuthWit(
          adminAddress,
          { caller: adminAddress, action },
          true,
        );
        await validateActionInteraction.send().wait();

        await expect(
          asset.methods.burn_public(adminAddress, amount, authwitNonce).simulate({ from: otherAddress }),
        ).rejects.toThrow(/unauthorized/);
      });

      it('burn from blacklisted account', async () => {
        await expect(
          asset.methods.burn_public(blacklistedAddress, 1n, 0).simulate({ from: blacklistedAddress }),
        ).rejects.toThrow(/Assertion failed: Blacklisted: Sender/);
      });
    });
  });

  describe('private', () => {
    it('burn less than balance', async () => {
      const balance0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      await asset.methods.burn(adminAddress, amount, 0).send({ from: adminAddress }).wait();
      tokenSim.burnPrivate(adminAddress, amount);
    });

    it('burn on behalf of other', async () => {
      const balance0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
      const amount = balance0 / 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset.methods.burn(adminAddress, amount, authwitNonce);

      // Both wallets are connected to same node and PXE so we could just insert directly
      // But doing it in two actions to show the flow.
      const witness = await wallet.createAuthWit(adminAddress, { caller: otherAddress, action });

      await asset.methods
        .burn(adminAddress, amount, authwitNonce)
        .send({ from: otherAddress, authWitnesses: [witness] })
        .wait();
      tokenSim.burnPrivate(adminAddress, amount);

      // Perform the transfer again, should fail
      const txReplay = asset.methods
        .burn(adminAddress, amount, authwitNonce)
        .send({ from: otherAddress, authWitnesses: [witness] });
      await expect(txReplay.wait()).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
    });

    describe('failure cases', () => {
      it('burn more than balance', async () => {
        const balance0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
        const amount = balance0 + 1n;
        expect(amount).toBeGreaterThan(0n);
        await expect(asset.methods.burn(adminAddress, amount, 0).simulate({ from: adminAddress })).rejects.toThrow(
          'Assertion failed: Balance too low',
        );
      });

      it('burn on behalf of self with non-zero nonce', async () => {
        const balance0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
        const amount = balance0 - 1n;
        expect(amount).toBeGreaterThan(0n);
        await expect(asset.methods.burn(adminAddress, amount, 1).simulate({ from: adminAddress })).rejects.toThrow(
          "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero",
        );
      });

      it('burn more than balance on behalf of other', async () => {
        const balance0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
        const amount = balance0 + 1n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.methods.burn(adminAddress, amount, authwitNonce);

        // Both wallets are connected to same node and PXE so we could just insert directly
        // But doing it in two actions to show the flow.
        const witness = await wallet.createAuthWit(adminAddress, { caller: otherAddress, action });

        await expect(action.simulate({ from: otherAddress, authWitnesses: [witness] })).rejects.toThrow(
          'Assertion failed: Balance too low',
        );
      });

      it('burn on behalf of other without approval', async () => {
        const balance0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
        const amount = balance0 / 2n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.methods.burn(adminAddress, amount, authwitNonce);
        const messageHash = await computeAuthWitMessageHash(
          { caller: otherAddress, call: await action.getFunctionCall() },
          await wallet.getChainInfo(),
        );

        await expect(action.simulate({ from: otherAddress })).rejects.toThrow(
          `Unknown auth witness for message hash ${messageHash.toString()}`,
        );
      });

      it('on behalf of other (invalid designated caller)', async () => {
        const balance0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
        const amount = balance0 + 2n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.methods.burn(adminAddress, amount, authwitNonce);
        const expectedMessageHash = await computeAuthWitMessageHash(
          { caller: blacklistedAddress, call: await action.getFunctionCall() },
          await wallet.getChainInfo(),
        );

        const witness = await wallet.createAuthWit(adminAddress, { caller: otherAddress, action });

        await expect(action.simulate({ from: blacklistedAddress, authWitnesses: [witness] })).rejects.toThrow(
          `Unknown auth witness for message hash ${expectedMessageHash.toString()}`,
        );
      });

      it('burn from blacklisted account', async () => {
        await expect(
          asset.methods.burn(blacklistedAddress, 1n, 0).simulate({ from: blacklistedAddress }),
        ).rejects.toThrow('Assertion failed: Blacklisted: Sender');
      });
    });
  });
});
