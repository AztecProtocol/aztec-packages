import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { computeAuthWitMessageHash } from '@aztec/aztec.js/authorization';
import type { ContractFunctionInteraction } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';

import { simulateThroughAuthwitProxy } from '../../fixtures/authwit_proxy.js';
import { U128_UNDERFLOW_ERROR } from '../../fixtures/index.js';
import { BlacklistTokenContractTest } from './blacklist_token_contract_test.js';
import { TokenContractTest } from './token_contract_test.js';
import {
  INVALID_AUTHWIT_NONCE_ERROR,
  amountAboveBalance,
  assertAuthwitProxyReplayRejected,
  assertPublicAuthwitReplayRejected,
  halfBalanceOf,
} from './token_test_helpers.js';

const BALANCE_TOO_LOW = 'Assertion failed: Balance too low';
const BLACKLISTED_SENDER = 'Assertion failed: Blacklisted: Sender';

/**
 * A ready-to-exercise burn harness: the underlying {@link TokenContractTest} or
 * {@link BlacklistTokenContractTest} plus the one operation whose method name differs between them
 * (`burn_private` vs `burn`). `burn_public` is identical on both, so tests call it off `t` directly.
 */
interface BurnHarness {
  t: TokenContractTest | BlacklistTokenContractTest;
  privateBurn: (from: AztecAddress, amount: bigint, nonce: Fr | number) => ContractFunctionInteraction;
  blacklistedAddress?: AztecAddress;
}

const scenarios: { name: string; setup: () => Promise<BurnHarness> }[] = [
  {
    name: 'Token',
    setup: async () => {
      const t = new TokenContractTest('burn');
      t.applyBaseSnapshots();
      await t.setup();
      await t.applyMint();
      return { t, privateBurn: (from, amount, nonce) => t.asset.methods.burn_private(from, amount, nonce) };
    },
  },
  {
    name: 'TokenBlacklist',
    setup: async () => {
      const t = new BlacklistTokenContractTest('blacklist_burn');
      await t.setup();
      // Adds the admin as minter, which is slow because it needs multiple blocks and role-change warps.
      await t.applyMint();
      return {
        t,
        privateBurn: (from, amount, nonce) => t.asset.methods.burn(from, amount, nonce),
        blacklistedAddress: t.blacklistedAddress,
      };
    },
  },
];

// Public and private burn coverage across both the plain Token and the TokenBlacklist contracts: direct
// burns, authwit-delegated burns (public authwit / private proxy), the failure cases, and the
// blacklist-only "sender is blacklisted" cases. Setup per harness: single node with AutomineSequencer,
// 3 accounts + authwit proxy, token deployed with initial public and private mint (the blacklist harness
// additionally warps past the 86400s role-change delay).
describe.each(scenarios)('automine/token/burn ($name)', ({ name, setup }) => {
  let s: BurnHarness;
  const isBlacklist = name === 'TokenBlacklist';

  beforeAll(async () => {
    s = await setup();
  }, 600_000);

  afterAll(async () => {
    await s.t.teardown();
  });

  afterEach(async () => {
    await s.t.tokenSim.check();
  });

  describe('public', () => {
    // Burns half the admin's public balance and verifies via TokenSimulator.
    it('burn less than balance', async () => {
      const amount = await halfBalanceOf(s.t.asset, 'public', s.t.adminAddress);
      await s.t.asset.methods.burn_public(s.t.adminAddress, amount, 0).send({ from: s.t.adminAddress });
      s.t.tokenSim.burnPublic(s.t.adminAddress, amount);
    });

    // Grants a public authwit for burn, burns via the delegated caller, then confirms the authwit is
    // single-use (replay reverts with unauthorized).
    it('burn on behalf of other', async () => {
      const amount = await halfBalanceOf(s.t.asset, 'public', s.t.adminAddress);
      const action = s.t.asset.methods.burn_public(s.t.adminAddress, amount, Fr.random());
      await assertPublicAuthwitReplayRejected(s.t.wallet, s.t.adminAddress, action, s.t.otherAddress, () =>
        s.t.tokenSim.burnPublic(s.t.adminAddress, amount),
      );
    });

    describe('failure cases', () => {
      it('burn more than balance', async () => {
        const amount = await amountAboveBalance(s.t.asset, 'public', s.t.adminAddress);
        await expect(
          s.t.asset.methods.burn_public(s.t.adminAddress, amount, 0).simulate({ from: s.t.adminAddress }),
        ).rejects.toThrow(U128_UNDERFLOW_ERROR);
      });

      it('burn on behalf of self with non-zero nonce', async () => {
        const amount = await halfBalanceOf(s.t.asset, 'public', s.t.adminAddress);
        await expect(
          s.t.asset.methods.burn_public(s.t.adminAddress, amount, 1).simulate({ from: s.t.adminAddress }),
        ).rejects.toThrow(INVALID_AUTHWIT_NONCE_ERROR);
      });

      it('burn on behalf of other without "approval"', async () => {
        const amount = await amountAboveBalance(s.t.asset, 'public', s.t.adminAddress);
        await expect(
          s.t.asset.methods.burn_public(s.t.adminAddress, amount, Fr.random()).simulate({ from: s.t.otherAddress }),
        ).rejects.toThrow(/unauthorized/);
      });

      it('burn more than balance on behalf of other', async () => {
        const amount = await amountAboveBalance(s.t.asset, 'public', s.t.adminAddress);
        const action = s.t.asset.methods.burn_public(s.t.adminAddress, amount, Fr.random());
        const grant = await s.t.wallet.setPublicAuthWit(s.t.adminAddress, { caller: s.t.otherAddress, action }, true);
        await grant.send();
        await expect(action.simulate({ from: s.t.otherAddress })).rejects.toThrow(U128_UNDERFLOW_ERROR);
      });

      it('burn on behalf of other, wrong designated caller', async () => {
        const amount = await amountAboveBalance(s.t.asset, 'public', s.t.adminAddress, 2n);
        const action = s.t.asset.methods.burn_public(s.t.adminAddress, amount, Fr.random());
        // Approve the owner as caller, but execute from `other`: the message hashes don't match.
        const grant = await s.t.wallet.setPublicAuthWit(s.t.adminAddress, { caller: s.t.adminAddress, action }, true);
        await grant.send();
        await expect(action.simulate({ from: s.t.otherAddress })).rejects.toThrow(/unauthorized/);
      });

      if (isBlacklist) {
        // Blacklist-only: a blacklisted account cannot burn its own tokens.
        it('burn from blacklisted account', async () => {
          await expect(
            s.t.asset.methods.burn_public(s.blacklistedAddress!, 1n, 0).simulate({ from: s.blacklistedAddress! }),
          ).rejects.toThrow(BLACKLISTED_SENDER);
        });
      }
    });
  });

  describe('private', () => {
    // Burns half the admin's private balance and verifies via TokenSimulator.
    it('burn less than balance', async () => {
      const amount = await halfBalanceOf(s.t.asset, 'private', s.t.adminAddress);
      await s.privateBurn(s.t.adminAddress, amount, 0).send({ from: s.t.adminAddress });
      s.t.tokenSim.burnPrivate(s.t.adminAddress, amount);
    });

    // Creates a private authwit for burn, sends through the proxy, then confirms replay reverts with a
    // duplicate-nullifier error.
    it('burn on behalf of other', async () => {
      const amount = await halfBalanceOf(s.t.asset, 'private', s.t.adminAddress);
      const action = s.privateBurn(s.t.adminAddress, amount, Fr.random());
      await assertAuthwitProxyReplayRejected(s.t.authwitProxy, s.t.wallet, s.t.adminAddress, action, () =>
        s.t.tokenSim.burnPrivate(s.t.adminAddress, amount),
      );
    });

    describe('failure cases', () => {
      it('burn more than balance', async () => {
        const amount = await amountAboveBalance(s.t.asset, 'private', s.t.adminAddress);
        await expect(s.privateBurn(s.t.adminAddress, amount, 0).simulate({ from: s.t.adminAddress })).rejects.toThrow(
          BALANCE_TOO_LOW,
        );
      });

      it('burn on behalf of self with non-zero nonce', async () => {
        const amount = await halfBalanceOf(s.t.asset, 'private', s.t.adminAddress);
        await expect(s.privateBurn(s.t.adminAddress, amount, 1).simulate({ from: s.t.adminAddress })).rejects.toThrow(
          INVALID_AUTHWIT_NONCE_ERROR,
        );
      });

      it('burn more than balance on behalf of other', async () => {
        const amount = await amountAboveBalance(s.t.asset, 'private', s.t.adminAddress);
        const action = s.privateBurn(s.t.adminAddress, amount, Fr.random());
        const witness = await s.t.wallet.createAuthWit(s.t.adminAddress, { caller: s.t.authwitProxy.address, action });
        await expect(
          simulateThroughAuthwitProxy(s.t.authwitProxy, action, { from: s.t.adminAddress, authWitnesses: [witness] }),
        ).rejects.toThrow(BALANCE_TOO_LOW);
      });

      it('burn on behalf of other without approval', async () => {
        const amount = await halfBalanceOf(s.t.asset, 'private', s.t.adminAddress);
        const action = s.privateBurn(s.t.adminAddress, amount, Fr.random());
        const call = await action.getFunctionCall();
        const messageHash = await computeAuthWitMessageHash(
          { caller: s.t.authwitProxy.address, call },
          await s.t.wallet.getChainInfo(),
        );
        await expect(simulateThroughAuthwitProxy(s.t.authwitProxy, action, { from: s.t.adminAddress })).rejects.toThrow(
          `Unknown auth witness for message hash ${messageHash.toString()}`,
        );
      });

      it('on behalf of other (invalid designated caller)', async () => {
        const amount = await halfBalanceOf(s.t.asset, 'private', s.t.adminAddress);
        const action = s.privateBurn(s.t.adminAddress, amount, Fr.random());
        const call = await action.getFunctionCall();
        const expectedMessageHash = await computeAuthWitMessageHash(
          { caller: s.t.authwitProxy.address, call },
          await s.t.wallet.getChainInfo(),
        );
        // Designate `other` as caller (not the proxy), then send through the proxy: the hashes don't match.
        const witness = await s.t.wallet.createAuthWit(s.t.adminAddress, { caller: s.t.otherAddress, action });
        await expect(
          simulateThroughAuthwitProxy(s.t.authwitProxy, action, { from: s.t.adminAddress, authWitnesses: [witness] }),
        ).rejects.toThrow(`Unknown auth witness for message hash ${expectedMessageHash.toString()}`);
      });

      if (isBlacklist) {
        // Blacklist-only: a blacklisted account cannot private-burn its own tokens.
        it('burn from blacklisted account', async () => {
          await expect(
            s.privateBurn(s.blacklistedAddress!, 1n, 0).simulate({ from: s.blacklistedAddress! }),
          ).rejects.toThrow(BLACKLISTED_SENDER);
        });
      }
    });
  });
});
