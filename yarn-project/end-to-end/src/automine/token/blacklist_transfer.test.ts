import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { computeAuthWitMessageHash } from '@aztec/aztec.js/authorization';
import type { ContractFunctionInteraction } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';

import { simulateThroughAuthwitProxy } from '../../fixtures/authwit_proxy.js';
import { U128_UNDERFLOW_ERROR } from '../../fixtures/index.js';
import { BlacklistTokenContractTest } from './blacklist_token_contract_test.js';
import {
  type BalanceKind,
  INVALID_AUTHWIT_NONCE_ERROR,
  amountAboveBalance,
  assertAuthwitProxyReplayRejected,
  assertPublicAuthwitReplayRejected,
  balanceOf,
  halfBalanceOf,
} from './token_test_helpers.js';

const BALANCE_TOO_LOW = 'Assertion failed: Balance too low';

/** A TokenBlacklist transfer mechanism: private transfers use a proxy authwit, public a public authwit. */
interface TransferMechanism {
  name: string;
  authwitKind: 'public' | 'private-proxy';
  balanceKind: BalanceKind;
  overBalanceError: string;
  transfer(from: AztecAddress, to: AztecAddress, amount: bigint, nonce: Fr | number): ContractFunctionInteraction;
  updateSim(from: AztecAddress, to: AztecAddress, amount: bigint): void;
}

// Private and public token transfers on TokenBlacklist, parameterized by authwit mechanism (private proxy
// vs public authwit): direct and self transfers, delegated transfers with single-use replay protection,
// the failure cases, and blacklist enforcement on both sender and recipient. Both mechanisms share one
// harness — private transfers only touch private balances and public transfers only public balances, so
// neither disturbs the other's starting mint. Setup: single node with AutomineSequencer, 3 accounts +
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
      it('transfer more than balance', async () => {
        const amount = await amountAboveBalance(t.asset, m.balanceKind, t.adminAddress);
        await expect(
          m.transfer(t.adminAddress, t.otherAddress, amount, 0).simulate({ from: t.adminAddress }),
        ).rejects.toThrow(m.overBalanceError);
      });

      it('transfer on behalf of self with non-zero nonce', async () => {
        const amount = await halfBalanceOf(t.asset, m.balanceKind, t.adminAddress);
        await expect(
          m.transfer(t.adminAddress, t.otherAddress, amount, 1).simulate({ from: t.adminAddress }),
        ).rejects.toThrow(INVALID_AUTHWIT_NONCE_ERROR);
      });

      it('transfer on behalf of other without approval', async () => {
        if (m.authwitKind === 'public') {
          const amount = await amountAboveBalance(t.asset, m.balanceKind, t.adminAddress);
          await expect(
            m.transfer(t.adminAddress, t.otherAddress, amount, Fr.random()).simulate({ from: t.otherAddress }),
          ).rejects.toThrow(/unauthorized/);
        } else {
          const amount = await halfBalanceOf(t.asset, m.balanceKind, t.adminAddress);
          const action = m.transfer(t.adminAddress, t.otherAddress, amount, Fr.random());
          const call = await action.getFunctionCall();
          const messageHash = await computeAuthWitMessageHash(
            { caller: t.authwitProxy.address, call },
            await t.wallet.getChainInfo(),
          );
          await expect(simulateThroughAuthwitProxy(t.authwitProxy, action, { from: t.adminAddress })).rejects.toThrow(
            `Unknown auth witness for message hash ${messageHash.toString()}`,
          );
        }
      });

      it('transfer more than balance on behalf of other', async () => {
        const amount = await amountAboveBalance(t.asset, m.balanceKind, t.adminAddress);
        const action = m.transfer(t.adminAddress, t.otherAddress, amount, Fr.random());
        const ownerBefore = await balanceOf(t.asset, m.balanceKind, t.adminAddress);
        const otherBefore = await balanceOf(t.asset, m.balanceKind, t.otherAddress);

        if (m.authwitKind === 'public') {
          const grant = await t.wallet.setPublicAuthWit(t.adminAddress, { caller: t.otherAddress, action }, true);
          await grant.send();
          await expect(action.simulate({ from: t.otherAddress })).rejects.toThrow(m.overBalanceError);
        } else {
          const witness = await t.wallet.createAuthWit(t.adminAddress, { caller: t.authwitProxy.address, action });
          await expect(
            simulateThroughAuthwitProxy(t.authwitProxy, action, { from: t.adminAddress, authWitnesses: [witness] }),
          ).rejects.toThrow(m.overBalanceError);
        }

        expect(await balanceOf(t.asset, m.balanceKind, t.adminAddress)).toEqual(ownerBefore);
        expect(await balanceOf(t.asset, m.balanceKind, t.otherAddress)).toEqual(otherBefore);
      });

      it('transfer on behalf of other, wrong designated caller', async () => {
        if (m.authwitKind === 'public') {
          const amount = await amountAboveBalance(t.asset, m.balanceKind, t.adminAddress, 2n);
          const action = m.transfer(t.adminAddress, t.otherAddress, amount, Fr.random());
          const ownerBefore = await balanceOf(t.asset, m.balanceKind, t.adminAddress);
          const otherBefore = await balanceOf(t.asset, m.balanceKind, t.otherAddress);
          // Approve the owner as caller, but execute from `other`: the message hashes don't match.
          const grant = await t.wallet.setPublicAuthWit(t.adminAddress, { caller: t.adminAddress, action }, true);
          await grant.send();
          await expect(action.simulate({ from: t.otherAddress })).rejects.toThrow(/unauthorized/);
          expect(await balanceOf(t.asset, m.balanceKind, t.adminAddress)).toEqual(ownerBefore);
          expect(await balanceOf(t.asset, m.balanceKind, t.otherAddress)).toEqual(otherBefore);
        } else {
          const amount = await halfBalanceOf(t.asset, m.balanceKind, t.adminAddress);
          const action = m.transfer(t.adminAddress, t.otherAddress, amount, Fr.random());
          const call = await action.getFunctionCall();
          const expectedMessageHash = await computeAuthWitMessageHash(
            { caller: t.authwitProxy.address, call },
            await t.wallet.getChainInfo(),
          );
          // Designate `other` as caller (not the proxy), then send through the proxy: the hashes don't match.
          const witness = await t.wallet.createAuthWit(t.adminAddress, { caller: t.otherAddress, action });
          const ownerBefore = await balanceOf(t.asset, m.balanceKind, t.adminAddress);
          const otherBefore = await balanceOf(t.asset, m.balanceKind, t.otherAddress);
          await expect(
            simulateThroughAuthwitProxy(t.authwitProxy, action, { from: t.adminAddress, authWitnesses: [witness] }),
          ).rejects.toThrow(`Unknown auth witness for message hash ${expectedMessageHash.toString()}`);
          expect(await balanceOf(t.asset, m.balanceKind, t.adminAddress)).toEqual(ownerBefore);
          expect(await balanceOf(t.asset, m.balanceKind, t.otherAddress)).toEqual(otherBefore);
        }
      });

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
