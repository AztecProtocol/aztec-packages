import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { ContractFunctionInteraction } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { GenericProxyContract } from '@aztec/noir-test-contracts.js/GenericProxy';

import { U128_UNDERFLOW_ERROR } from '../../fixtures/index.js';
import type { TokenSimulator } from '../../simulators/token_simulator.js';
import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { BlacklistTokenContractTest } from './blacklist_token_contract_test.js';
import { TokenContractTest } from './token_contract_test.js';
import {
  type BalanceReadable,
  type TokenFailureRefs,
  assertAuthwitProxyReplayRejected,
  assertPublicAuthwitReplayRejected,
  halfBalanceOf,
  runTokenFailureCases,
} from './token_test_helpers.js';

const BALANCE_TOO_LOW = 'Assertion failed: Balance too low';
const BLACKLISTED_SENDER = 'Assertion failed: Blacklisted: Sender';

/**
 * Uniform view over a burn harness (Token or TokenBlacklist), hiding the differing private-burn method name
 * (`burn_private` vs `burn`), delegated-caller account, and blacklist surface behind one interface.
 */
interface BurnScenario {
  teardown(): Promise<void>;
  tokenSim: TokenSimulator;
  asset: BalanceReadable;
  wallet: TestWallet;
  proxy: GenericProxyContract;
  owner: AztecAddress;
  other: AztecAddress;
  blacklistedAddress?: AztecAddress;
  publicBurn(from: AztecAddress, amount: bigint, nonce: Fr | number): ContractFunctionInteraction;
  privateBurn(from: AztecAddress, amount: bigint, nonce: Fr | number): ContractFunctionInteraction;
}

const scenarios: { name: string; setup: () => Promise<BurnScenario> }[] = [
  {
    name: 'Token',
    setup: async () => {
      const t = new TokenContractTest('burn');
      t.applyBaseSnapshots();
      t.applyMintSnapshot();
      await t.setup();
      return {
        teardown: () => t.teardown(),
        tokenSim: t.tokenSim,
        asset: t.asset,
        wallet: t.wallet,
        proxy: t.authwitProxy,
        owner: t.adminAddress,
        other: t.account1Address,
        publicBurn: (from, amount, nonce) => t.asset.methods.burn_public(from, amount, nonce),
        privateBurn: (from, amount, nonce) => t.asset.methods.burn_private(from, amount, nonce),
      };
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
        teardown: () => t.teardown(),
        tokenSim: t.tokenSim,
        asset: t.asset,
        wallet: t.wallet,
        proxy: t.authwitProxy,
        owner: t.adminAddress,
        other: t.otherAddress,
        blacklistedAddress: t.blacklistedAddress,
        publicBurn: (from, amount, nonce) => t.asset.methods.burn_public(from, amount, nonce),
        privateBurn: (from, amount, nonce) => t.asset.methods.burn(from, amount, nonce),
      };
    },
  },
];

// Public and private burn coverage across both the plain Token and the TokenBlacklist contracts: direct
// burns, authwit-delegated burns (public authwit / private proxy), the shared failure matrix, and the
// blacklist-only "sender is blacklisted" cases. Setup per harness: single node with AutomineSequencer,
// 3 accounts + authwit proxy, token deployed with initial public and private mint (the blacklist harness
// additionally warps past the 86400s role-change delay).
describe.each(scenarios)('automine/token/burn ($name)', ({ name, setup }) => {
  let s: BurnScenario;
  const isBlacklist = name === 'TokenBlacklist';

  beforeAll(async () => {
    s = await setup();
  }, 600_000);

  afterAll(async () => {
    await s.teardown();
  });

  afterEach(async () => {
    await s.tokenSim.check();
  });

  const refs = (): TokenFailureRefs => ({
    balanceAsset: s.asset,
    wallet: s.wallet,
    proxy: s.proxy,
    owner: s.owner,
    other: s.other,
  });

  describe('public', () => {
    // Burns half the admin's public balance and verifies via TokenSimulator.
    it('burn less than balance', async () => {
      const amount = await halfBalanceOf(s.asset, 'public', s.owner);
      await s.publicBurn(s.owner, amount, 0).send({ from: s.owner });
      s.tokenSim.burnPublic(s.owner, amount);
    });

    // Grants a public authwit for burn, burns via the delegated caller, then confirms the authwit is
    // single-use (replay reverts with unauthorized).
    it('burn on behalf of other', async () => {
      const amount = await halfBalanceOf(s.asset, 'public', s.owner);
      const action = s.publicBurn(s.owner, amount, Fr.random());
      await assertPublicAuthwitReplayRejected(s.wallet, s.owner, action, s.other, () =>
        s.tokenSim.burnPublic(s.owner, amount),
      );
    });

    describe('failure cases', () => {
      runTokenFailureCases(
        refs,
        {
          balanceKind: 'public',
          authwitKind: 'public',
          buildAction: (r, amount, nonce) => s.publicBurn(r.owner, amount, nonce),
        },
        [
          { failureMode: 'over-balance', expectedError: U128_UNDERFLOW_ERROR, title: 'burn more than balance' },
          { failureMode: 'invalid-nonce', title: 'burn on behalf of self with non-zero nonce' },
          { failureMode: 'no-approval', title: 'burn on behalf of other without "approval"' },
          {
            failureMode: 'over-balance-via-authwit',
            expectedError: U128_UNDERFLOW_ERROR,
            title: 'burn more than balance on behalf of other',
          },
          { failureMode: 'wrong-caller', title: 'burn on behalf of other, wrong designated caller' },
        ],
      );

      if (isBlacklist) {
        // Blacklist-only: a blacklisted account cannot burn its own tokens.
        it('burn from blacklisted account', async () => {
          await expect(
            s.publicBurn(s.blacklistedAddress!, 1n, 0).simulate({ from: s.blacklistedAddress! }),
          ).rejects.toThrow(BLACKLISTED_SENDER);
        });
      }
    });
  });

  describe('private', () => {
    // Burns half the admin's private balance and verifies via TokenSimulator.
    it('burn less than balance', async () => {
      const amount = await halfBalanceOf(s.asset, 'private', s.owner);
      await s.privateBurn(s.owner, amount, 0).send({ from: s.owner });
      s.tokenSim.burnPrivate(s.owner, amount);
    });

    // Creates a private authwit for burn, sends through the proxy, then confirms replay reverts with a
    // duplicate-nullifier error.
    it('burn on behalf of other', async () => {
      const amount = await halfBalanceOf(s.asset, 'private', s.owner);
      const action = s.privateBurn(s.owner, amount, Fr.random());
      await assertAuthwitProxyReplayRejected(s.proxy, s.wallet, s.owner, action, () =>
        s.tokenSim.burnPrivate(s.owner, amount),
      );
    });

    describe('failure cases', () => {
      runTokenFailureCases(
        refs,
        {
          balanceKind: 'private',
          authwitKind: 'private-proxy',
          buildAction: (r, amount, nonce) => s.privateBurn(r.owner, amount, nonce),
        },
        [
          { failureMode: 'over-balance', expectedError: BALANCE_TOO_LOW, title: 'burn more than balance' },
          { failureMode: 'invalid-nonce', title: 'burn on behalf of self with non-zero nonce' },
          {
            failureMode: 'over-balance-via-authwit',
            expectedError: BALANCE_TOO_LOW,
            title: 'burn more than balance on behalf of other',
          },
          { failureMode: 'no-approval', title: 'burn on behalf of other without approval' },
          { failureMode: 'wrong-caller', title: 'on behalf of other (invalid designated caller)' },
        ],
      );

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
