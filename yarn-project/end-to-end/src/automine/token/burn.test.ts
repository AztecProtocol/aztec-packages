import { computeAuthWitMessageHash } from '@aztec/aztec.js/authorization';
import { Fr } from '@aztec/aztec.js/fields';

import { sendThroughAuthwitProxy, simulateThroughAuthwitProxy } from '../../fixtures/authwit_proxy.js';
import { DUPLICATE_NULLIFIER_ERROR, U128_UNDERFLOW_ERROR } from '../../fixtures/index.js';
import { TokenContractTest } from './token_contract_test.js';

// Covers public and private burn on Token contract: direct, authwit-delegated via proxy, and error paths.
// Setup: single node with AutomineSequencer, 3 accounts, Token deployed with initial public and private mint.
describe('automine/token/burn', () => {
  const t = new TokenContractTest('burn');
  let { asset, tokenSim, wallet, adminAddress, account1Address } = t;

  beforeAll(async () => {
    t.applyBaseSnapshots();
    t.applyMintSnapshot();
    await t.setup();
    // Have to destructure again to ensure we have latest refs.
    ({ asset, wallet, adminAddress, tokenSim, adminAddress, account1Address } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  // Public burn: direct burn, authwit-delegated burn, and error cases.
  describe('public', () => {
    // Burns half the admin's public balance and verifies via TokenSimulator.
    it('burn less than balance', async () => {
      const { result: balance0 } = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      await asset.methods.burn_public(adminAddress, amount, 0).send({ from: adminAddress });

      tokenSim.burnPublic(adminAddress, amount);
    });

    // Grants a public authwit for burn to account1, burns, verifies TokenSimulator, then confirms replay
    // reverts with unauthorized.
    it('burn on behalf of other', async () => {
      const { result: balance0 } = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      const authwitNonce = Fr.random();

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset.methods.burn_public(adminAddress, amount, authwitNonce);
      const validateActionInteraction = await wallet.setPublicAuthWit(
        adminAddress,
        { caller: account1Address, action },
        true,
      );
      await validateActionInteraction.send();

      await action.send({ from: account1Address });

      tokenSim.burnPublic(adminAddress, amount);

      await expect(
        asset.methods.burn_public(adminAddress, amount, authwitNonce).simulate({ from: account1Address }),
      ).rejects.toThrow(/unauthorized/);
    });

    // Error paths for public burn.
    describe('failure cases', () => {
      // Attempts to burn more than public balance; expects U128_UNDERFLOW_ERROR.
      it('burn more than balance', async () => {
        const { result: balance0 } = await asset.methods
          .balance_of_public(adminAddress)
          .simulate({ from: adminAddress });
        const amount = balance0 + 1n;
        const authwitNonce = 0;
        await expect(
          asset.methods.burn_public(adminAddress, amount, authwitNonce).simulate({ from: adminAddress }),
        ).rejects.toThrow(U128_UNDERFLOW_ERROR);
      });

      // Self-burn with nonce=1; expects the invalid-nonce assertion.
      it('burn on behalf of self with non-zero nonce', async () => {
        const { result: balance0 } = await asset.methods
          .balance_of_public(adminAddress)
          .simulate({ from: adminAddress });
        const amount = balance0 - 1n;
        expect(amount).toBeGreaterThan(0n);
        const authwitNonce = 1;
        await expect(
          asset.methods.burn_public(adminAddress, amount, authwitNonce).simulate({ from: adminAddress }),
        ).rejects.toThrow(
          "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero",
        );
      });

      // Burn from account1 without authwit; expects unauthorized.
      it('burn on behalf of other without "approval"', async () => {
        const { result: balance0 } = await asset.methods
          .balance_of_public(adminAddress)
          .simulate({ from: adminAddress });
        const amount = balance0 + 1n;
        const authwitNonce = Fr.random();
        await expect(
          asset.methods.burn_public(adminAddress, amount, authwitNonce).simulate({ from: account1Address }),
        ).rejects.toThrow(/unauthorized/);
      });

      // Approves a burn exceeding balance via authwit; expects U128_UNDERFLOW_ERROR on simulate.
      it('burn more than balance on behalf of other', async () => {
        const { result: balance0 } = await asset.methods
          .balance_of_public(adminAddress)
          .simulate({ from: adminAddress });
        const amount = balance0 + 1n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.methods.burn_public(adminAddress, amount, authwitNonce);
        const validateActionInteraction = await wallet.setPublicAuthWit(
          adminAddress,
          { caller: account1Address, action },
          true,
        );
        await validateActionInteraction.send();

        await expect(action.simulate({ from: account1Address })).rejects.toThrow(U128_UNDERFLOW_ERROR);
      });

      // Approves adminAddress as caller but tries from account1; expects unauthorized.
      it('burn on behalf of other, wrong designated caller', async () => {
        const { result: balance0 } = await asset.methods
          .balance_of_public(adminAddress)
          .simulate({ from: adminAddress });
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
          asset.methods.burn_public(adminAddress, amount, authwitNonce).simulate({ from: account1Address }),
        ).rejects.toThrow(/unauthorized/);
      });
    });
  });

  // Private burn: direct burn, authwit-delegated burn via proxy, and error cases.
  describe('private', () => {
    // Burns half the admin's private balance and verifies via TokenSimulator.
    it('burn less than balance', async () => {
      const { result: balance0 } = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress });
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      await asset.methods.burn_private(adminAddress, amount, 0).send({ from: adminAddress });
      tokenSim.burnPrivate(adminAddress, amount);
    });

    // Creates a private authwit for burn_private, sends through proxy, verifies TokenSimulator, then asserts
    // replay fails with DUPLICATE_NULLIFIER_ERROR.
    it('burn on behalf of other', async () => {
      const { result: balance0 } = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress });
      const amount = balance0 / 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      const action = asset.methods.burn_private(adminAddress, amount, authwitNonce);
      const witness = await wallet.createAuthWit(adminAddress, { caller: t.authwitProxy.address, action });

      // Admin sends through proxy so their keys are in scope, while proxy becomes msg_sender to trigger authwit.
      await sendThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] });
      tokenSim.burnPrivate(adminAddress, amount);

      // Perform the transfer again, should fail
      await expect(
        sendThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] }),
      ).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
    });

    // Error paths for private burn.
    describe('failure cases', () => {
      // Attempts to burn more than private balance; expects 'Balance too low'.
      it('burn more than balance', async () => {
        const { result: balance0 } = await asset.methods
          .balance_of_private(adminAddress)
          .simulate({ from: adminAddress });
        const amount = balance0 + 1n;
        expect(amount).toBeGreaterThan(0n);
        await expect(
          asset.methods.burn_private(adminAddress, amount, 0).simulate({ from: adminAddress }),
        ).rejects.toThrow('Assertion failed: Balance too low');
      });

      // Self-burn with nonce=1; expects the invalid-nonce assertion.
      it('burn on behalf of self with non-zero nonce', async () => {
        const { result: balance0 } = await asset.methods
          .balance_of_private(adminAddress)
          .simulate({ from: adminAddress });
        const amount = balance0 - 1n;
        expect(amount).toBeGreaterThan(0n);
        await expect(
          asset.methods.burn_private(adminAddress, amount, 1).simulate({ from: adminAddress }),
        ).rejects.toThrow(
          "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero",
        );
      });

      // Creates authwit for burn exceeding balance via proxy; expects 'Balance too low' on simulate.
      it('burn more than balance on behalf of other', async () => {
        const { result: balance0 } = await asset.methods
          .balance_of_private(adminAddress)
          .simulate({ from: adminAddress });
        const amount = balance0 + 1n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        const action = asset.methods.burn_private(adminAddress, amount, authwitNonce);
        const witness = await wallet.createAuthWit(adminAddress, { caller: t.authwitProxy.address, action });

        // Admin sends through proxy so their keys are in scope, while proxy becomes msg_sender to trigger authwit.
        await expect(
          simulateThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] }),
        ).rejects.toThrow('Assertion failed: Balance too low');
      });

      // Simulates burn through proxy without a witness; expects unknown-authwit error.
      it('burn on behalf of other without approval', async () => {
        const { result: balance0 } = await asset.methods
          .balance_of_private(adminAddress)
          .simulate({ from: adminAddress });
        const amount = balance0 / 2n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        const action = asset.methods.burn_private(adminAddress, amount, authwitNonce);
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

      // Creates authwit designating account1 as caller but sends through proxy; expects unknown-authwit error
      // because the message hash references the proxy, not account1.
      it('on behalf of other (invalid designated caller)', async () => {
        const { result: balancePriv0 } = await asset.methods
          .balance_of_private(adminAddress)
          .simulate({ from: adminAddress });
        const amount = balancePriv0 + 2n;
        const authwitNonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        const action = asset.methods.burn_private(adminAddress, amount, authwitNonce);
        const call = await action.getFunctionCall();
        const expectedMessageHash = await computeAuthWitMessageHash(
          { caller: t.authwitProxy.address, call },
          await wallet.getChainInfo(),
        );

        const witness = await wallet.createAuthWit(adminAddress, { caller: account1Address, action });

        // Admin sends through proxy so their keys are in scope, while proxy becomes msg_sender to trigger authwit.
        await expect(
          simulateThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] }),
        ).rejects.toThrow(`Unknown auth witness for message hash ${expectedMessageHash.toString()}`);
      });
    });
  });
});
