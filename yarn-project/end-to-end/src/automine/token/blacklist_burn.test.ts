import { computeAuthWitMessageHash } from '@aztec/aztec.js/authorization';
import { Fr } from '@aztec/aztec.js/fields';

import { sendThroughAuthwitProxy, simulateThroughAuthwitProxy } from '../../fixtures/authwit_proxy.js';
import { DUPLICATE_NULLIFIER_ERROR, U128_UNDERFLOW_ERROR } from '../../fixtures/index.js';
import { BlacklistTokenContractTest } from './blacklist_token_contract_test.js';

// Covers public and private burn operations on TokenBlacklist, including authwit-delegated burns and
// blacklist enforcement. Setup: single node with AutomineSequencer, 3 accounts, TokenBlacklist deployed,
// initial mint applied (admin has both public and private balances). Time-warp required to cross
// role-change delay (86400s) during setup.
describe('automine/token/blacklist_burn', () => {
  const t = new BlacklistTokenContractTest('burn');
  let { asset, tokenSim, wallet, adminAddress, otherAddress, blacklistedAddress } = t;

  beforeAll(async () => {
    await t.setup();
    // Beware that we are adding the wallet as minter here, which is very slow because it needs multiple blocks.
    await t.applyMint();
    // Have to destructure again to ensure we have latest refs.
    ({ asset, tokenSim, wallet, adminAddress, otherAddress, blacklistedAddress } = t);
  }, 600_000);

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  // Public burn path: direct burns and authwit-delegated burns.
  describe('public', () => {
    // Burns half the admin's public balance and verifies via TokenSimulator.
    it('burn less than balance', async () => {
      const balance0 = await asset.methods
        .balance_of_public(adminAddress)
        .simulate({ from: adminAddress })
        .then(r => r.result);
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      await asset.methods.burn_public(adminAddress, amount, 0).send({ from: adminAddress });

      tokenSim.burnPublic(adminAddress, amount);
    });

    // Grants a public authwit for burn, burns via otherAddress, then asserts the authwit is consumed
    // (replay reverts with unauthorized).
    it('burn on behalf of other', async () => {
      const balance0 = await asset.methods
        .balance_of_public(adminAddress)
        .simulate({ from: adminAddress })
        .then(r => r.result);
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
      await validateActionInteraction.send();

      await action.send({ from: otherAddress });

      tokenSim.burnPublic(adminAddress, amount);

      await expect(
        asset.methods.burn_public(adminAddress, amount, authwitNonce).simulate({ from: otherAddress }),
      ).rejects.toThrow(/unauthorized/);
    });

    // Error paths for public burn: overflow, nonce, missing approval, wrong caller, blacklist.
    describe('failure cases', () => {
      // Attempts to burn more than the current balance and expects U128_UNDERFLOW_ERROR.
      it('burn more than balance', async () => {
        const balance0 = await asset.methods
          .balance_of_public(adminAddress)
          .simulate({ from: adminAddress })
          .then(r => r.result);
        const amount = balance0 + 1n;
        const authwitNonce = 0;
        await expect(
          asset.methods.burn_public(adminAddress, amount, authwitNonce).simulate({ from: adminAddress }),
        ).rejects.toThrow(U128_UNDERFLOW_ERROR);
      });

      // Verifies that self-burn with a non-zero nonce reverts with the invalid-nonce assertion.
      it('burn on behalf of self with non-zero nonce', async () => {
        const balance0 = await asset.methods
          .balance_of_public(adminAddress)
          .simulate({ from: adminAddress })
          .then(r => r.result);
        const amount = balance0 - 1n;
        expect(amount).toBeGreaterThan(0n);
        const authwitNonce = 1;
        await expect(
          asset.methods.burn_public(adminAddress, amount, authwitNonce).simulate({ from: adminAddress }),
        ).rejects.toThrow(
          "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero",
        );
      });

      // Calls burn_public on behalf of admin from otherAddress without any authwit and expects unauthorized.
      it('burn on behalf of other without "approval"', async () => {
        const balance0 = await asset.methods
          .balance_of_public(adminAddress)
          .simulate({ from: adminAddress })
          .then(r => r.result);
        const amount = balance0 + 1n;
        const authwitNonce = Fr.random();
        await expect(
          asset.methods.burn_public(adminAddress, amount, authwitNonce).simulate({ from: otherAddress }),
        ).rejects.toThrow(/unauthorized/);
      });

      // Approves a burn of more than balance via authwit, then expects U128_UNDERFLOW_ERROR on simulate.
      it('burn more than balance on behalf of other', async () => {
        const balance0 = await asset.methods
          .balance_of_public(adminAddress)
          .simulate({ from: adminAddress })
          .then(r => r.result);
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
        await validateActionInteraction.send();

        await expect(action.simulate({ from: otherAddress })).rejects.toThrow(U128_UNDERFLOW_ERROR);
      });

      // Creates an authwit designating adminAddress as the caller but executes from otherAddress; expects
      // unauthorized because the caller doesn't match the authwit.
      it('burn on behalf of other, wrong designated caller', async () => {
        const balance0 = await asset.methods
          .balance_of_public(adminAddress)
          .simulate({ from: adminAddress })
          .then(r => r.result);
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
        await validateActionInteraction.send();

        await expect(
          asset.methods.burn_public(adminAddress, amount, authwitNonce).simulate({ from: otherAddress }),
        ).rejects.toThrow(/unauthorized/);
      });

      // Verifies that a blacklisted account cannot burn its own tokens (Blacklisted: Sender).
      it('burn from blacklisted account', async () => {
        await expect(
          asset.methods.burn_public(blacklistedAddress, 1n, 0).simulate({ from: blacklistedAddress }),
        ).rejects.toThrow(/Assertion failed: Blacklisted: Sender/);
      });
    });
  });

  // Private burn path: direct burns and authwit-delegated burns via proxy.
  describe('private', () => {
    // Burns half the admin's private balance and verifies via TokenSimulator.
    it('burn less than balance', async () => {
      const balance0 = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress })
        .then(r => r.result);
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      await asset.methods.burn(adminAddress, amount, 0).send({ from: adminAddress });
      tokenSim.burnPrivate(adminAddress, amount);
    });

    // Creates a private authwit for burn, sends it through the proxy (so msg_sender differs from note owner),
    // verifies TokenSimulator, then asserts replay reverts with DUPLICATE_NULLIFIER_ERROR.
    it('burn on behalf of other', async () => {
      const balance0 = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress })
        .then(r => r.result);
      const amount = balance0 / 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      const action = asset.methods.burn(adminAddress, amount, authwitNonce);
      const witness = await wallet.createAuthWit(adminAddress, { caller: t.authwitProxy.address, action });

      // Admin sends through proxy so their keys are in scope, while proxy becomes msg_sender to trigger authwit.
      await sendThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] });
      tokenSim.burnPrivate(adminAddress, amount);

      // Perform the transfer again, should fail
      await expect(
        sendThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] }),
      ).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
    });

    // Error paths for private burn: overflow, nonce, missing approval, wrong caller, blacklist.
    describe('failure cases', () => {
      // Attempts to burn more than private balance and expects the 'Balance too low' assertion.
      it('burn more than balance', async () => {
        const balance0 = await asset.methods
          .balance_of_private(adminAddress)
          .simulate({ from: adminAddress })
          .then(r => r.result);
        const amount = balance0 + 1n;
        expect(amount).toBeGreaterThan(0n);
        await expect(asset.methods.burn(adminAddress, amount, 0).simulate({ from: adminAddress })).rejects.toThrow(
          'Assertion failed: Balance too low',
        );
      });

      // Verifies that self-burn with nonce=1 reverts with the invalid-nonce assertion.
      it('burn on behalf of self with non-zero nonce', async () => {
        const balance0 = await asset.methods
          .balance_of_private(adminAddress)
          .simulate({ from: adminAddress })
          .then(r => r.result);
        const amount = balance0 - 1n;
        expect(amount).toBeGreaterThan(0n);
        await expect(asset.methods.burn(adminAddress, amount, 1).simulate({ from: adminAddress })).rejects.toThrow(
          "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero",
        );
      });

      // Creates authwit for a burn exceeding balance; expects 'Balance too low' when simulated through proxy.
      it('burn more than balance on behalf of other', async () => {
        const balance0 = await asset.methods
          .balance_of_private(adminAddress)
          .simulate({ from: adminAddress })
          .then(r => r.result);
        const amount = balance0 + 1n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        const action = asset.methods.burn(adminAddress, amount, authwitNonce);
        const witness = await wallet.createAuthWit(adminAddress, { caller: t.authwitProxy.address, action });

        // Admin sends through proxy so their keys are in scope, while proxy becomes msg_sender to trigger authwit.
        await expect(
          simulateThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] }),
        ).rejects.toThrow('Assertion failed: Balance too low');
      });

      // Simulates burn through proxy without providing a witness; expects unknown-authwit error.
      it('burn on behalf of other without approval', async () => {
        const balance0 = await asset.methods
          .balance_of_private(adminAddress)
          .simulate({ from: adminAddress })
          .then(r => r.result);
        const amount = balance0 / 2n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        const action = asset.methods.burn(adminAddress, amount, authwitNonce);
        const call = await action.getFunctionCall();
        const messageHash = await computeAuthWitMessageHash(
          { caller: t.authwitProxy.address, call },
          await wallet.getChainInfo(),
        );

        // Admin sends through proxy so their keys are in scope, while proxy becomes msg_sender to trigger authwit.
        await expect(simulateThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress })).rejects.toThrow(
          `Unknown auth witness for message hash ${messageHash.toString()}`,
        );
      });

      // Creates authwit designating otherAddress as caller but sends through proxy; expects unknown-authwit error
      // because the computed message hash doesn't match the proxy's address.
      it('on behalf of other (invalid designated caller)', async () => {
        const balance0 = await asset.methods
          .balance_of_private(adminAddress)
          .simulate({ from: adminAddress })
          .then(r => r.result);
        const amount = balance0 + 2n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        const action = asset.methods.burn(adminAddress, amount, authwitNonce);
        const call = await action.getFunctionCall();
        const expectedMessageHash = await computeAuthWitMessageHash(
          { caller: t.authwitProxy.address, call },
          await wallet.getChainInfo(),
        );

        const witness = await wallet.createAuthWit(adminAddress, { caller: otherAddress, action });

        // Admin sends through proxy so their keys are in scope, while proxy becomes msg_sender to trigger authwit.
        await expect(
          simulateThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] }),
        ).rejects.toThrow(`Unknown auth witness for message hash ${expectedMessageHash.toString()}`);
      });

      // Verifies that a blacklisted account cannot private-burn its tokens (Blacklisted: Sender).
      it('burn from blacklisted account', async () => {
        await expect(
          asset.methods.burn(blacklistedAddress, 1n, 0).simulate({ from: blacklistedAddress }),
        ).rejects.toThrow('Assertion failed: Blacklisted: Sender');
      });
    });
  });
});
