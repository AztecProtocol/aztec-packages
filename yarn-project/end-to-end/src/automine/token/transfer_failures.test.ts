import { computeAuthWitMessageHash, computeInnerAuthWitHashFromAction } from '@aztec/aztec.js/authorization';
import { Fr } from '@aztec/aztec.js/fields';

import { sendThroughAuthwitProxy, simulateThroughAuthwitProxy } from '../../fixtures/authwit_proxy.js';
import { DUPLICATE_NULLIFIER_ERROR, U128_UNDERFLOW_ERROR } from '../../fixtures/fixtures.js';
import { TokenContractTest } from './token_contract_test.js';
import { INVALID_AUTHWIT_NONCE_ERROR, amountAboveBalance, balanceOf, halfBalanceOf } from './token_test_helpers.js';

const BALANCE_TOO_LOW = 'Assertion failed: Balance too low';

// Failure-case coverage for the Token transfer entrypoints. Every entrypoint shares one TokenContractTest
// harness (base + mint); the failure cases are simulate-only or authwit grants/cancels that never move
// token balances, so the mint balances stay constant across all cases. Happy paths and event assertions
// live in transfer.test.ts. Setup: single node with AutomineSequencer, 3 accounts + InvalidAccount +
// authwit proxy, Token deployed with initial public and private mint.
describe('automine/token/transfer_failures', () => {
  const t = new TokenContractTest('transfer_failures');

  beforeAll(async () => {
    t.applyBaseSnapshots();
    await t.setup();
    await t.applyMint();
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  // Single kept copy of the triplicate skip stub that previously lived in transfer, transfer_in_public, and
  // transfer_in_private.
  it.skip('transfer into account to overflow', () => {
    // This should already be covered by the mint case earlier. e.g., since we cannot mint to overflow, there is not
    // a way to get funds enough to overflow.
    // Require direct storage manipulation for us to perform a nice explicit case though.
    // See https://github.com/AztecProtocol/aztec-packages/issues/1259
  });

  describe('transfer', () => {
    it('transfer more than balance', async () => {
      const amount = await amountAboveBalance(t.asset, 'private', t.adminAddress);
      await expect(t.asset.methods.transfer(t.otherAddress, amount).simulate({ from: t.adminAddress })).rejects.toThrow(
        BALANCE_TOO_LOW,
      );
    });
  });

  describe('transfer_in_private', () => {
    it('transfer on behalf of self with non-zero nonce', async () => {
      const amount = await halfBalanceOf(t.asset, 'private', t.adminAddress);
      await expect(
        t.asset.methods
          .transfer_in_private(t.adminAddress, t.otherAddress, amount, 1)
          .simulate({ from: t.adminAddress }),
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringMatching(INVALID_AUTHWIT_NONCE_ERROR),
          stack: expect.stringMatching(/at Token\.transfer_in_private.*/),
        }),
      );
    });

    it('transfer more than balance on behalf of other', async () => {
      const amount = await amountAboveBalance(t.asset, 'private', t.adminAddress);
      const action = t.asset.methods.transfer_in_private(t.adminAddress, t.otherAddress, amount, Fr.random());
      const ownerBefore = await balanceOf(t.asset, 'private', t.adminAddress);
      const otherBefore = await balanceOf(t.asset, 'private', t.otherAddress);

      const witness = await t.wallet.createAuthWit(t.adminAddress, { caller: t.authwitProxy.address, action });
      await expect(
        simulateThroughAuthwitProxy(t.authwitProxy, action, { from: t.adminAddress, authWitnesses: [witness] }),
      ).rejects.toThrow(BALANCE_TOO_LOW);

      expect(await balanceOf(t.asset, 'private', t.adminAddress)).toEqual(ownerBefore);
      expect(await balanceOf(t.asset, 'private', t.otherAddress)).toEqual(otherBefore);
    });

    it('transfer on behalf of other without approval', async () => {
      const amount = await halfBalanceOf(t.asset, 'private', t.adminAddress);
      const action = t.asset.methods.transfer_in_private(t.adminAddress, t.otherAddress, amount, Fr.random());
      const call = await action.getFunctionCall();
      const messageHash = await computeAuthWitMessageHash(
        { caller: t.authwitProxy.address, call },
        await t.wallet.getChainInfo(),
      );
      await expect(simulateThroughAuthwitProxy(t.authwitProxy, action, { from: t.adminAddress })).rejects.toThrow(
        `Unknown auth witness for message hash ${messageHash.toString()}`,
      );
    });

    it('transfer on behalf of other, wrong designated caller', async () => {
      const amount = await halfBalanceOf(t.asset, 'private', t.adminAddress);
      const action = t.asset.methods.transfer_in_private(t.adminAddress, t.otherAddress, amount, Fr.random());
      const call = await action.getFunctionCall();
      const expectedMessageHash = await computeAuthWitMessageHash(
        { caller: t.authwitProxy.address, call },
        await t.wallet.getChainInfo(),
      );

      // Designate `other` as caller (not the proxy), then send through the proxy: the hashes don't match.
      const witness = await t.wallet.createAuthWit(t.adminAddress, { caller: t.otherAddress, action });
      const ownerBefore = await balanceOf(t.asset, 'private', t.adminAddress);
      const otherBefore = await balanceOf(t.asset, 'private', t.otherAddress);
      await expect(
        simulateThroughAuthwitProxy(t.authwitProxy, action, { from: t.adminAddress, authWitnesses: [witness] }),
      ).rejects.toThrow(`Unknown auth witness for message hash ${expectedMessageHash.toString()}`);

      expect(await balanceOf(t.asset, 'private', t.adminAddress)).toEqual(ownerBefore);
      expect(await balanceOf(t.asset, 'private', t.otherAddress)).toEqual(otherBefore);
    });

    it('transfer on behalf of other, cancelled authwit', async () => {
      const amount = await halfBalanceOf(t.asset, 'private', t.adminAddress);
      const action = t.asset.methods.transfer_in_private(t.adminAddress, t.otherAddress, amount, Fr.random());
      const witness = await t.wallet.createAuthWit(t.adminAddress, { caller: t.authwitProxy.address, action });
      const innerHash = await computeInnerAuthWitHashFromAction(t.authwitProxy.address, action);
      await t.asset.methods.cancel_authwit(innerHash).send({ from: t.adminAddress });
      await expect(
        sendThroughAuthwitProxy(t.authwitProxy, action, { from: t.adminAddress, authWitnesses: [witness] }),
      ).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
    });

    // Uses the InvalidAccount contract as the 'from' address; expects 'Message not authorized by account'
    // because the bad contract returns a malformed validation response.
    it('transfer on behalf of other, invalid verify_private_authwit on "from"', async () => {
      await expect(
        t.asset.methods
          .transfer_in_private(t.badAccount.address, t.otherAddress, 0, Fr.random())
          .simulate({ from: t.otherAddress }),
      ).rejects.toThrow('Assertion failed: Message not authorized by account');
    });
  });

  describe('transfer_in_public', () => {
    it('transfer more than balance', async () => {
      const amount = await amountAboveBalance(t.asset, 'public', t.adminAddress);
      await expect(
        t.asset.methods
          .transfer_in_public(t.adminAddress, t.otherAddress, amount, 0)
          .simulate({ from: t.adminAddress }),
      ).rejects.toThrow(U128_UNDERFLOW_ERROR);
    });

    it('transfer on behalf of self with non-zero nonce', async () => {
      const amount = await halfBalanceOf(t.asset, 'public', t.adminAddress);
      await expect(
        t.asset.methods
          .transfer_in_public(t.adminAddress, t.otherAddress, amount, 1)
          .simulate({ from: t.adminAddress }),
      ).rejects.toThrow(INVALID_AUTHWIT_NONCE_ERROR);
    });

    it('transfer on behalf of other without "approval"', async () => {
      const amount = await amountAboveBalance(t.asset, 'public', t.adminAddress);
      await expect(
        t.asset.methods
          .transfer_in_public(t.adminAddress, t.otherAddress, amount, Fr.random())
          .simulate({ from: t.otherAddress }),
      ).rejects.toThrow(/unauthorized/);
    });

    it('transfer more than balance on behalf of other', async () => {
      const amount = await amountAboveBalance(t.asset, 'public', t.adminAddress);
      const action = t.asset.methods.transfer_in_public(t.adminAddress, t.otherAddress, amount, Fr.random());
      const ownerBefore = await balanceOf(t.asset, 'public', t.adminAddress);
      const otherBefore = await balanceOf(t.asset, 'public', t.otherAddress);

      const grant = await t.wallet.setPublicAuthWit(t.adminAddress, { caller: t.otherAddress, action }, true);
      await grant.send();
      await expect(action.simulate({ from: t.otherAddress })).rejects.toThrow(U128_UNDERFLOW_ERROR);

      expect(await balanceOf(t.asset, 'public', t.adminAddress)).toEqual(ownerBefore);
      expect(await balanceOf(t.asset, 'public', t.otherAddress)).toEqual(otherBefore);
    });

    it('transfer on behalf of other, wrong designated caller', async () => {
      const amount = await amountAboveBalance(t.asset, 'public', t.adminAddress, 2n);
      const action = t.asset.methods.transfer_in_public(t.adminAddress, t.otherAddress, amount, Fr.random());
      const ownerBefore = await balanceOf(t.asset, 'public', t.adminAddress);
      const otherBefore = await balanceOf(t.asset, 'public', t.otherAddress);

      // Approve the owner as caller, but execute from `other`: the message hashes don't match.
      const grant = await t.wallet.setPublicAuthWit(t.adminAddress, { caller: t.adminAddress, action }, true);
      await grant.send();
      await expect(action.simulate({ from: t.otherAddress })).rejects.toThrow(/unauthorized/);

      expect(await balanceOf(t.asset, 'public', t.adminAddress)).toEqual(ownerBefore);
      expect(await balanceOf(t.asset, 'public', t.otherAddress)).toEqual(otherBefore);
    });

    it('transfer on behalf of other, cancelled authwit', async () => {
      const amount = await halfBalanceOf(t.asset, 'public', t.adminAddress);
      const action = t.asset.methods.transfer_in_public(t.adminAddress, t.otherAddress, amount, Fr.random());
      const grant = await t.wallet.setPublicAuthWit(t.adminAddress, { caller: t.otherAddress, action }, true);
      await grant.send();
      const revoke = await t.wallet.setPublicAuthWit(t.adminAddress, { caller: t.otherAddress, action }, false);
      await revoke.send();
      await expect(action.simulate({ from: t.otherAddress })).rejects.toThrow(/unauthorized/);
    });

    // Same grant-then-revoke flow as 'cancelled authwit' but reconstructs the method call for the final
    // simulate rather than reusing the action object — verifies both call forms produce unauthorized.
    it('transfer on behalf of other, cancelled authwit (reconstructed call)', async () => {
      const amount = await halfBalanceOf(t.asset, 'public', t.adminAddress);
      const authwitNonce = Fr.random();
      const action = t.asset.methods.transfer_in_public(t.adminAddress, t.otherAddress, amount, authwitNonce);

      const grant = await t.wallet.setPublicAuthWit(t.adminAddress, { caller: t.otherAddress, action }, true);
      await grant.send();
      const revoke = await t.wallet.setPublicAuthWit(t.adminAddress, { caller: t.otherAddress, action }, false);
      await revoke.send();

      await expect(
        t.asset.methods
          .transfer_in_public(t.adminAddress, t.otherAddress, amount, authwitNonce)
          .simulate({ from: t.otherAddress }),
      ).rejects.toThrow(/unauthorized/);
    });

    // Uses the InvalidAccount contract as the 'from' address; expects unauthorized because the bad contract
    // returns a malformed authwit validation value.
    it('transfer on behalf of other, invalid spend_public_authwit on "from"', async () => {
      await expect(
        t.asset.methods
          .transfer_in_public(t.badAccount.address, t.otherAddress, 0, Fr.random())
          .simulate({ from: t.otherAddress }),
      ).rejects.toThrow(/unauthorized/);
    });
  });

  describe('transfer_to_private', () => {
    it('to self (more than balance)', async () => {
      const amount = await amountAboveBalance(t.asset, 'public', t.adminAddress);
      await expect(
        t.asset.methods.transfer_to_private(t.adminAddress, amount).simulate({ from: t.adminAddress }),
      ).rejects.toThrow(U128_UNDERFLOW_ERROR);
    });
  });

  describe('transfer_to_public', () => {
    it('on behalf of self (more than balance)', async () => {
      const amount = await amountAboveBalance(t.asset, 'private', t.adminAddress);
      await expect(
        t.asset.methods
          .transfer_to_public(t.adminAddress, t.otherAddress, amount, 0)
          .simulate({ from: t.adminAddress }),
      ).rejects.toThrow(BALANCE_TOO_LOW);
    });

    it('on behalf of self (invalid authwit nonce)', async () => {
      const amount = await halfBalanceOf(t.asset, 'private', t.adminAddress);
      await expect(
        t.asset.methods
          .transfer_to_public(t.adminAddress, t.otherAddress, amount, 1)
          .simulate({ from: t.adminAddress }),
      ).rejects.toThrow(INVALID_AUTHWIT_NONCE_ERROR);
    });

    it('on behalf of other (more than balance)', async () => {
      const amount = await amountAboveBalance(t.asset, 'private', t.adminAddress);
      const action = t.asset.methods.transfer_to_public(t.adminAddress, t.otherAddress, amount, Fr.random());
      const witness = await t.wallet.createAuthWit(t.adminAddress, { caller: t.authwitProxy.address, action });
      await expect(
        simulateThroughAuthwitProxy(t.authwitProxy, action, { from: t.adminAddress, authWitnesses: [witness] }),
      ).rejects.toThrow(BALANCE_TOO_LOW);
    });

    it('on behalf of other (invalid designated caller)', async () => {
      const amount = await halfBalanceOf(t.asset, 'private', t.adminAddress);
      const action = t.asset.methods.transfer_to_public(t.adminAddress, t.otherAddress, amount, Fr.random());
      const call = await action.getFunctionCall();
      const expectedMessageHash = await computeAuthWitMessageHash(
        { caller: t.authwitProxy.address, call },
        await t.wallet.getChainInfo(),
      );

      // Designate `other` as caller (not the proxy), then send through the proxy: the hashes don't match.
      const witness = await t.wallet.createAuthWit(t.adminAddress, { caller: t.otherAddress, action });
      await expect(
        simulateThroughAuthwitProxy(t.authwitProxy, action, { from: t.adminAddress, authWitnesses: [witness] }),
      ).rejects.toThrow(`Unknown auth witness for message hash ${expectedMessageHash.toString()}`);
    });
  });
});
