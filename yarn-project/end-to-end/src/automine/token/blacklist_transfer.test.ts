import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { ContractFunctionInteraction } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';

import { U128_UNDERFLOW_ERROR } from '../../fixtures/index.js';
import { BlacklistTokenContractTest } from './blacklist_token_contract_test.js';
import {
  type AuthwitKind,
  type BalanceKind,
  type TokenFailureRow,
  assertAuthwitProxyReplayRejected,
  assertPublicAuthwitReplayRejected,
  halfBalanceOf,
  runTokenFailureCases,
} from './token_test_helpers.js';

const BALANCE_TOO_LOW = 'Assertion failed: Balance too low';

/** A TokenBlacklist transfer mechanism: private transfers use a proxy authwit, public a public authwit. */
interface TransferMechanism {
  name: string;
  authwitKind: AuthwitKind;
  balanceKind: BalanceKind;
  overBalanceError: string;
  transfer(from: AztecAddress, to: AztecAddress, amount: bigint, nonce: Fr | number): ContractFunctionInteraction;
  updateSim(from: AztecAddress, to: AztecAddress, amount: bigint): void;
}

// Private and public token transfers on TokenBlacklist, parameterized by authwit mechanism (private proxy
// vs public authwit): direct and self transfers, delegated transfers with single-use replay protection,
// the shared failure matrix, and blacklist enforcement on both sender and recipient. Both mechanisms share
// one harness — private transfers only touch private balances and public transfers only public balances,
// so neither disturbs the other's starting mint. Setup: single node with AutomineSequencer, 3 accounts +
// authwit proxy, TokenBlacklist deployed with initial mint (warps past the 86400s role-change delay).
describe('automine/token/blacklist_transfer', () => {
  const t = new BlacklistTokenContractTest('blacklist_transfer');

  beforeAll(async () => {
    await t.setup();
    // Adds the admin as minter, which is slow because it needs multiple blocks and role-change warps.
    await t.applyMint();
  }, 600_000);

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  const mechanisms: TransferMechanism[] = [
    {
      name: 'private',
      authwitKind: 'private-proxy',
      balanceKind: 'private',
      overBalanceError: BALANCE_TOO_LOW,
      transfer: (from, to, amount, nonce) => t.asset.methods.transfer(from, to, amount, nonce),
      updateSim: (from, to, amount) => t.tokenSim.transferPrivate(from, to, amount),
    },
    {
      name: 'public',
      authwitKind: 'public',
      balanceKind: 'public',
      overBalanceError: U128_UNDERFLOW_ERROR,
      transfer: (from, to, amount, nonce) => t.asset.methods.transfer_public(from, to, amount, nonce),
      updateSim: (from, to, amount) => t.tokenSim.transferPublic(from, to, amount),
    },
  ];

  describe.each(mechanisms)('$name', m => {
    // Transfers half of admin's balance to other and verifies via TokenSimulator.
    it('transfer less than balance', async () => {
      const amount = await halfBalanceOf(t.asset, m.balanceKind, t.adminAddress);
      await m.transfer(t.adminAddress, t.otherAddress, amount, 0).send({ from: t.adminAddress });
      m.updateSim(t.adminAddress, t.otherAddress, amount);
    });

    // Transfers half of admin's balance to themselves; verifies balance is unchanged via TokenSimulator.
    it('transfer to self', async () => {
      const amount = await halfBalanceOf(t.asset, m.balanceKind, t.adminAddress);
      await m.transfer(t.adminAddress, t.adminAddress, amount, 0).send({ from: t.adminAddress });
      m.updateSim(t.adminAddress, t.adminAddress, amount);
    });

    // Delegates a transfer to other, verifies via TokenSimulator, then confirms the authwit is single-use.
    it('transfer on behalf of other', async () => {
      const amount = await halfBalanceOf(t.asset, m.balanceKind, t.adminAddress);
      const action = m.transfer(t.adminAddress, t.otherAddress, amount, Fr.random());
      const updateSim = () => m.updateSim(t.adminAddress, t.otherAddress, amount);
      if (m.authwitKind === 'public') {
        await assertPublicAuthwitReplayRejected(t.wallet, t.adminAddress, action, t.otherAddress, updateSim);
      } else {
        await assertAuthwitProxyReplayRejected(t.authwitProxy, t.wallet, t.adminAddress, action, updateSim);
      }
    });

    describe('failure cases', () => {
      const rows: TokenFailureRow[] = [
        { failureMode: 'over-balance', expectedError: m.overBalanceError, title: 'transfer more than balance' },
        { failureMode: 'invalid-nonce', title: 'transfer on behalf of self with non-zero nonce' },
        { failureMode: 'no-approval', title: 'transfer on behalf of other without approval' },
        {
          failureMode: 'over-balance-via-authwit',
          expectedError: m.overBalanceError,
          assertBalancesUnchanged: true,
          title: 'transfer more than balance on behalf of other',
        },
        {
          failureMode: 'wrong-caller',
          assertBalancesUnchanged: true,
          title: 'transfer on behalf of other, wrong designated caller',
        },
      ];

      runTokenFailureCases(
        () => ({
          balanceAsset: t.asset,
          wallet: t.wallet,
          proxy: t.authwitProxy,
          owner: t.adminAddress,
          other: t.otherAddress,
        }),
        {
          balanceKind: m.balanceKind,
          authwitKind: m.authwitKind,
          buildAction: (r, amount, nonce) => m.transfer(r.owner, r.other, amount, nonce),
        },
        rows,
      );

      it.skip('transfer into account to overflow', () => {
        // This should already be covered by the mint case earlier. e.g., since we cannot mint to overflow, there is
        // not a way to get funds enough to overflow.
        // Require direct storage manipulation for us to perform a nice explicit case though.
        // See https://github.com/AztecProtocol/aztec-packages/issues/1259
      });

      // A blacklisted account cannot send (Blacklisted: Sender).
      it('transfer from a blacklisted account', async () => {
        await expect(
          m.transfer(t.blacklistedAddress, t.adminAddress, 1n, 0).simulate({ from: t.blacklistedAddress }),
        ).rejects.toThrow('Assertion failed: Blacklisted: Sender');
      });

      // A blacklisted account cannot receive (Blacklisted: Recipient).
      it('transfer to a blacklisted account', async () => {
        await expect(
          m.transfer(t.adminAddress, t.blacklistedAddress, 1n, 0).simulate({ from: t.adminAddress }),
        ).rejects.toThrow('Assertion failed: Blacklisted: Recipient');
      });
    });
  });
});
