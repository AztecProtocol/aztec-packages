import { Fr } from '@aztec/aztec.js/fields';

import { U128_UNDERFLOW_ERROR } from '../../fixtures/fixtures.js';
import { TokenContractTest } from './token_contract_test.js';
import { type TokenFailureRefs, halfBalanceOf, runTokenFailureCases } from './token_test_helpers.js';

const BALANCE_TOO_LOW = 'Assertion failed: Balance too low';

// Parameterized failure-case coverage for the Token transfer entrypoints. Every entrypoint shares one
// TokenContractTest harness (base + mint); the failure cases are simulate-only or authwit grants/cancels
// that never move token balances, so the mint balances stay constant across all cases. Happy paths and
// event assertions live in transfer.test.ts. Setup: single node with AutomineSequencer, 3 accounts +
// InvalidAccount + authwit proxy, Token deployed with initial public and private mint.
describe('automine/token/transfer_failures', () => {
  const t = new TokenContractTest('transfer_failures');

  beforeAll(async () => {
    t.applyBaseSnapshots();
    t.applyMintSnapshot();
    await t.setup();
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  const refs = (): TokenFailureRefs => ({
    balanceAsset: t.asset,
    wallet: t.wallet,
    proxy: t.authwitProxy,
    owner: t.adminAddress,
    other: t.account1Address,
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
    runTokenFailureCases(
      refs,
      {
        balanceKind: 'private',
        authwitKind: 'none',
        buildAction: (r, amount) => t.asset.methods.transfer(r.other, amount),
      },
      [{ failureMode: 'over-balance', expectedError: BALANCE_TOO_LOW, title: 'transfer more than balance' }],
    );
  });

  describe('transfer_in_private', () => {
    runTokenFailureCases(
      refs,
      {
        balanceKind: 'private',
        authwitKind: 'private-proxy',
        buildAction: (r, amount, nonce) => t.asset.methods.transfer_in_private(r.owner, r.other, amount, nonce),
        cancelAuthwit: async innerHash => {
          await t.asset.methods.cancel_authwit(innerHash).send({ from: t.adminAddress });
        },
      },
      [
        {
          failureMode: 'invalid-nonce',
          expectedStack: /at Token\.transfer_in_private.*/,
          title: 'transfer on behalf of self with non-zero nonce',
        },
        {
          failureMode: 'over-balance-via-authwit',
          expectedError: BALANCE_TOO_LOW,
          assertBalancesUnchanged: true,
          title: 'transfer more than balance on behalf of other',
        },
        { failureMode: 'no-approval', title: 'transfer on behalf of other without approval' },
        {
          failureMode: 'wrong-caller',
          assertBalancesUnchanged: true,
          title: 'transfer on behalf of other, wrong designated caller',
        },
        { failureMode: 'cancelled-authwit', title: 'transfer on behalf of other, cancelled authwit' },
      ],
    );

    // Uses the InvalidAccount contract as the 'from' address; expects 'Message not authorized by account'
    // because the bad contract returns a malformed validation response.
    it('transfer on behalf of other, invalid verify_private_authwit on "from"', async () => {
      await expect(
        t.asset.methods
          .transfer_in_private(t.badAccount.address, t.account1Address, 0, Fr.random())
          .simulate({ from: t.account1Address }),
      ).rejects.toThrow('Assertion failed: Message not authorized by account');
    });
  });

  describe('transfer_in_public', () => {
    runTokenFailureCases(
      refs,
      {
        balanceKind: 'public',
        authwitKind: 'public',
        buildAction: (r, amount, nonce) => t.asset.methods.transfer_in_public(r.owner, r.other, amount, nonce),
      },
      [
        { failureMode: 'over-balance', expectedError: U128_UNDERFLOW_ERROR, title: 'transfer more than balance' },
        { failureMode: 'invalid-nonce', title: 'transfer on behalf of self with non-zero nonce' },
        { failureMode: 'no-approval', title: 'transfer on behalf of other without "approval"' },
        {
          failureMode: 'over-balance-via-authwit',
          expectedError: U128_UNDERFLOW_ERROR,
          assertBalancesUnchanged: true,
          title: 'transfer more than balance on behalf of other',
        },
        {
          failureMode: 'wrong-caller',
          assertBalancesUnchanged: true,
          title: 'transfer on behalf of other, wrong designated caller',
        },
        { failureMode: 'cancelled-authwit', title: 'transfer on behalf of other, cancelled authwit' },
      ],
    );

    // Same grant-then-revoke flow as 'cancelled authwit' but reconstructs the method call for the final
    // simulate rather than reusing the action object — verifies both call forms produce unauthorized.
    it('transfer on behalf of other, cancelled authwit (reconstructed call)', async () => {
      const amount = await halfBalanceOf(t.asset, 'public', t.adminAddress);
      const authwitNonce = Fr.random();
      const action = t.asset.methods.transfer_in_public(t.adminAddress, t.account1Address, amount, authwitNonce);

      const grant = await t.wallet.setPublicAuthWit(t.adminAddress, { caller: t.account1Address, action }, true);
      await grant.send();
      const revoke = await t.wallet.setPublicAuthWit(t.adminAddress, { caller: t.account1Address, action }, false);
      await revoke.send();

      await expect(
        t.asset.methods
          .transfer_in_public(t.adminAddress, t.account1Address, amount, authwitNonce)
          .simulate({ from: t.account1Address }),
      ).rejects.toThrow(/unauthorized/);
    });

    // Uses the InvalidAccount contract as the 'from' address; expects unauthorized because the bad contract
    // returns a malformed authwit validation value.
    it('transfer on behalf of other, invalid spend_public_authwit on "from"', async () => {
      await expect(
        t.asset.methods
          .transfer_in_public(t.badAccount.address, t.account1Address, 0, Fr.random())
          .simulate({ from: t.account1Address }),
      ).rejects.toThrow(/unauthorized/);
    });
  });

  describe('transfer_to_private', () => {
    runTokenFailureCases(
      refs,
      {
        balanceKind: 'public',
        authwitKind: 'none',
        buildAction: (r, amount) => t.asset.methods.transfer_to_private(r.owner, amount),
      },
      [{ failureMode: 'over-balance', expectedError: U128_UNDERFLOW_ERROR, title: 'to self (more than balance)' }],
    );
  });

  describe('transfer_to_public', () => {
    runTokenFailureCases(
      refs,
      {
        balanceKind: 'private',
        authwitKind: 'private-proxy',
        buildAction: (r, amount, nonce) => t.asset.methods.transfer_to_public(r.owner, r.other, amount, nonce),
      },
      [
        { failureMode: 'over-balance', expectedError: BALANCE_TOO_LOW, title: 'on behalf of self (more than balance)' },
        { failureMode: 'invalid-nonce', title: 'on behalf of self (invalid authwit nonce)' },
        {
          failureMode: 'over-balance-via-authwit',
          expectedError: BALANCE_TOO_LOW,
          title: 'on behalf of other (more than balance)',
        },
        { failureMode: 'wrong-caller', title: 'on behalf of other (invalid designated caller)' },
      ],
    );
  });
});
