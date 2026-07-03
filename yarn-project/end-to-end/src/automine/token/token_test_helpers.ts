import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { computeAuthWitMessageHash, computeInnerAuthWitHashFromAction } from '@aztec/aztec.js/authorization';
import type { ContractFunctionInteraction } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { AMMContract } from '@aztec/noir-contracts.js/AMM';
import type { GenericProxyContract } from '@aztec/noir-test-contracts.js/GenericProxy';

import { sendThroughAuthwitProxy, simulateThroughAuthwitProxy } from '../../fixtures/authwit_proxy.js';
import { DUPLICATE_NULLIFIER_ERROR } from '../../fixtures/fixtures.js';
import { type AnyTokenContract, mintTokensToPrivate } from '../../fixtures/token_utils.js';
import type { TestWallet } from '../../test-wallet/test_wallet.js';

/** Whether an amount / balance is read from the private or public balance of the token. */
export type BalanceKind = 'private' | 'public';

/**
 * How a token operation is delegated to a caller other than the note owner:
 * - `public`: a public authwit set via `setPublicAuthWit`.
 * - `private-proxy`: a private authwit consumed through the {@link GenericProxyContract}.
 * - `none`: the operation exposes no on-behalf-of surface (direct calls only).
 */
export type AuthwitKind = 'public' | 'private-proxy' | 'none';

/**
 * A single token failure scenario. Rows differ only by the operation's error string and whether the
 * caller asserts balances stay unchanged; the mechanics are driven by the entrypoint's {@link AuthwitKind}.
 */
export type FailureMode =
  | 'over-balance'
  | 'invalid-nonce'
  | 'over-balance-via-authwit'
  | 'no-approval'
  | 'wrong-caller'
  | 'cancelled-authwit';

/** The invalid-authwit-nonce assertion the contract raises when `from == msg_sender` but nonce != 0. */
export const INVALID_AUTHWIT_NONCE_ERROR =
  "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero";

/** Minimal token shape needed to read balances — satisfied structurally by Token/TestToken/TokenBlacklist. */
export interface BalanceReadable {
  methods: {
    balance_of_private(owner: AztecAddress): { simulate(opts: { from: AztecAddress }): Promise<{ result: bigint }> };
    balance_of_public(owner: AztecAddress): { simulate(opts: { from: AztecAddress }): Promise<{ result: bigint }> };
  };
}

/** Reads the private or public balance of an account, simulating from that account's own scope. */
export async function balanceOf(asset: BalanceReadable, kind: BalanceKind, account: AztecAddress): Promise<bigint> {
  const interaction =
    kind === 'private' ? asset.methods.balance_of_private(account) : asset.methods.balance_of_public(account);
  return (await interaction.simulate({ from: account })).result;
}

/** Returns half of an account's balance, asserting it is non-zero so the operation under test is meaningful. */
export async function halfBalanceOf(asset: BalanceReadable, kind: BalanceKind, owner: AztecAddress): Promise<bigint> {
  const amount = (await balanceOf(asset, kind, owner)) / 2n;
  expect(amount).toBeGreaterThan(0n);
  return amount;
}

/** Returns an amount just above an account's balance (balance + delta), asserting it is non-zero. */
export async function amountAboveBalance(
  asset: BalanceReadable,
  kind: BalanceKind,
  owner: AztecAddress,
  delta = 1n,
): Promise<bigint> {
  const amount = (await balanceOf(asset, kind, owner)) + delta;
  expect(amount).toBeGreaterThan(0n);
  return amount;
}

/**
 * Grants a public authwit for `caller` to run `action` on behalf of `owner`, executes it from `caller`,
 * then asserts a replay of the same call reverts as unauthorized (the authwit is single-use).
 *
 * `onExecuted` runs after the successful execution (before the replay attempt) so callers can update
 * their {@link TokenSimulator} to match the state change the executed action produced.
 */
export async function assertPublicAuthwitReplayRejected(
  wallet: TestWallet,
  owner: AztecAddress,
  action: ContractFunctionInteraction,
  caller: AztecAddress,
  onExecuted?: () => void,
): Promise<void> {
  const grant = await wallet.setPublicAuthWit(owner, { caller, action }, true);
  await grant.send();

  await action.send({ from: caller });
  onExecuted?.();

  await expect(action.simulate({ from: caller })).rejects.toThrow(/unauthorized/);
}

/**
 * Creates a private authwit for `owner`, executes `action` through the authwit proxy (so `msg_sender`
 * differs from the note owner), then asserts a replay reverts with a duplicate-nullifier error.
 *
 * `onExecuted` runs after the successful execution (before the replay attempt) so callers can update
 * their {@link TokenSimulator} to match the state change the executed action produced.
 */
export async function assertAuthwitProxyReplayRejected(
  proxy: GenericProxyContract,
  wallet: TestWallet,
  owner: AztecAddress,
  action: ContractFunctionInteraction,
  onExecuted?: () => void,
): Promise<void> {
  const witness = await wallet.createAuthWit(owner, { caller: proxy.address, action });

  await sendThroughAuthwitProxy(proxy, action, { from: owner, authWitnesses: [witness] });
  onExecuted?.();

  await expect(sendThroughAuthwitProxy(proxy, action, { from: owner, authWitnesses: [witness] })).rejects.toThrow(
    DUPLICATE_NULLIFIER_ERROR,
  );
}

/** Runtime handles a failure row needs; read lazily inside each `it` so `beforeAll` has populated them. */
export interface TokenFailureRefs {
  /** Token used for balance reads (structural — Token or TokenBlacklist). */
  balanceAsset: BalanceReadable;
  wallet: TestWallet;
  proxy: GenericProxyContract;
  /** The token owner (the `from` of every operation). */
  owner: AztecAddress;
  /** The designated caller / recipient for on-behalf-of operations. */
  other: AztecAddress;
}

/** Describes one token entrypoint's failure surface (the operation and how it delegates to a caller). */
export interface TokenFailureEntrypoint {
  balanceKind: BalanceKind;
  authwitKind: AuthwitKind;
  /** Builds the token action for the given amount and authwit nonce. */
  buildAction(refs: TokenFailureRefs, amount: bigint, nonce: Fr | number): ContractFunctionInteraction;
  /** Cancels a private authwit by inner hash; required for `cancelled-authwit` rows on `private-proxy`. */
  cancelAuthwit?(innerHash: Fr): Promise<void>;
}

/** One failure scenario for an entrypoint. `expectedError` only matters for balance-related modes. */
export interface TokenFailureRow {
  failureMode: FailureMode;
  /** The error thrown by the balance check (`over-balance` / `over-balance-via-authwit`). */
  expectedError?: string | RegExp;
  /** When set, asserts the owner's and other's balances are unchanged after the reverted attempt. */
  assertBalancesUnchanged?: boolean;
  /** Optional stack matcher for `invalid-nonce` (verifies the assertion originates in the token method). */
  expectedStack?: RegExp;
  /** Overrides the auto-generated test title. */
  title?: string;
}

const DEFAULT_TITLES: Record<FailureMode, string> = {
  'over-balance': 'reverts when transferring more than balance',
  'invalid-nonce': 'reverts on self-call with a non-zero authwit nonce',
  'over-balance-via-authwit': 'reverts when the authorized amount exceeds balance',
  'no-approval': 'reverts when called on behalf of other without approval',
  'wrong-caller': 'reverts when the authwit designates the wrong caller',
  'cancelled-authwit': 'reverts when the authwit has been cancelled',
};

async function snapshotBalances(refs: TokenFailureRefs, kind: BalanceKind): Promise<[bigint, bigint]> {
  return [await balanceOf(refs.balanceAsset, kind, refs.owner), await balanceOf(refs.balanceAsset, kind, refs.other)];
}

async function expectBalancesUnchanged(refs: TokenFailureRefs, kind: BalanceKind, [owner, other]: [bigint, bigint]) {
  expect(await balanceOf(refs.balanceAsset, kind, refs.owner)).toEqual(owner);
  expect(await balanceOf(refs.balanceAsset, kind, refs.other)).toEqual(other);
}

async function runFailureMode(
  refs: TokenFailureRefs,
  entrypoint: TokenFailureEntrypoint,
  row: TokenFailureRow,
): Promise<void> {
  const { balanceKind, authwitKind, buildAction } = entrypoint;

  switch (row.failureMode) {
    case 'over-balance': {
      const amount = await amountAboveBalance(refs.balanceAsset, balanceKind, refs.owner);
      await expect(buildAction(refs, amount, 0).simulate({ from: refs.owner })).rejects.toThrow(row.expectedError);
      break;
    }

    case 'invalid-nonce': {
      const amount = await halfBalanceOf(refs.balanceAsset, balanceKind, refs.owner);
      const simulation = buildAction(refs, amount, 1).simulate({ from: refs.owner });
      if (row.expectedStack) {
        await expect(simulation).rejects.toThrow(
          expect.objectContaining({
            message: expect.stringMatching(INVALID_AUTHWIT_NONCE_ERROR),
            stack: expect.stringMatching(row.expectedStack),
          }),
        );
      } else {
        await expect(simulation).rejects.toThrow(INVALID_AUTHWIT_NONCE_ERROR);
      }
      break;
    }

    case 'over-balance-via-authwit': {
      const amount = await amountAboveBalance(refs.balanceAsset, balanceKind, refs.owner);
      const action = buildAction(refs, amount, Fr.random());
      const before = row.assertBalancesUnchanged ? await snapshotBalances(refs, balanceKind) : undefined;
      if (authwitKind === 'public') {
        const grant = await refs.wallet.setPublicAuthWit(refs.owner, { caller: refs.other, action }, true);
        await grant.send();
        await expect(action.simulate({ from: refs.other })).rejects.toThrow(row.expectedError);
      } else {
        const witness = await refs.wallet.createAuthWit(refs.owner, { caller: refs.proxy.address, action });
        await expect(
          simulateThroughAuthwitProxy(refs.proxy, action, { from: refs.owner, authWitnesses: [witness] }),
        ).rejects.toThrow(row.expectedError);
      }
      if (before) {
        await expectBalancesUnchanged(refs, balanceKind, before);
      }
      break;
    }

    case 'no-approval': {
      if (authwitKind === 'public') {
        const amount = await amountAboveBalance(refs.balanceAsset, balanceKind, refs.owner);
        await expect(buildAction(refs, amount, Fr.random()).simulate({ from: refs.other })).rejects.toThrow(
          /unauthorized/,
        );
      } else {
        const amount = await halfBalanceOf(refs.balanceAsset, balanceKind, refs.owner);
        const action = buildAction(refs, amount, Fr.random());
        const call = await action.getFunctionCall();
        const messageHash = await computeAuthWitMessageHash(
          { caller: refs.proxy.address, call },
          await refs.wallet.getChainInfo(),
        );
        await expect(simulateThroughAuthwitProxy(refs.proxy, action, { from: refs.owner })).rejects.toThrow(
          `Unknown auth witness for message hash ${messageHash.toString()}`,
        );
      }
      break;
    }

    case 'wrong-caller': {
      if (authwitKind === 'public') {
        const amount = await amountAboveBalance(refs.balanceAsset, balanceKind, refs.owner, 2n);
        const action = buildAction(refs, amount, Fr.random());
        const before = row.assertBalancesUnchanged ? await snapshotBalances(refs, balanceKind) : undefined;
        // Approve the owner as caller, but execute from `other`: the message hashes don't match.
        const grant = await refs.wallet.setPublicAuthWit(refs.owner, { caller: refs.owner, action }, true);
        await grant.send();
        await expect(action.simulate({ from: refs.other })).rejects.toThrow(/unauthorized/);
        if (before) {
          await expectBalancesUnchanged(refs, balanceKind, before);
        }
      } else {
        const amount = await halfBalanceOf(refs.balanceAsset, balanceKind, refs.owner);
        const action = buildAction(refs, amount, Fr.random());
        const call = await action.getFunctionCall();
        const expectedMessageHash = await computeAuthWitMessageHash(
          { caller: refs.proxy.address, call },
          await refs.wallet.getChainInfo(),
        );
        // Designate `other` as caller (not the proxy), then send through the proxy: hashes don't match.
        const witness = await refs.wallet.createAuthWit(refs.owner, { caller: refs.other, action });
        const before = row.assertBalancesUnchanged ? await snapshotBalances(refs, balanceKind) : undefined;
        await expect(
          simulateThroughAuthwitProxy(refs.proxy, action, { from: refs.owner, authWitnesses: [witness] }),
        ).rejects.toThrow(`Unknown auth witness for message hash ${expectedMessageHash.toString()}`);
        if (before) {
          await expectBalancesUnchanged(refs, balanceKind, before);
        }
      }
      break;
    }

    case 'cancelled-authwit': {
      const amount = await halfBalanceOf(refs.balanceAsset, balanceKind, refs.owner);
      const action = buildAction(refs, amount, Fr.random());
      if (authwitKind === 'public') {
        const grant = await refs.wallet.setPublicAuthWit(refs.owner, { caller: refs.other, action }, true);
        await grant.send();
        const revoke = await refs.wallet.setPublicAuthWit(refs.owner, { caller: refs.other, action }, false);
        await revoke.send();
        await expect(action.simulate({ from: refs.other })).rejects.toThrow(/unauthorized/);
      } else {
        if (!entrypoint.cancelAuthwit) {
          throw new Error('cancelled-authwit on private-proxy requires entrypoint.cancelAuthwit');
        }
        const witness = await refs.wallet.createAuthWit(refs.owner, { caller: refs.proxy.address, action });
        const innerHash = await computeInnerAuthWitHashFromAction(refs.proxy.address, action);
        await entrypoint.cancelAuthwit(innerHash);
        await expect(
          sendThroughAuthwitProxy(refs.proxy, action, { from: refs.owner, authWitnesses: [witness] }),
        ).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
      }
      break;
    }
  }
}

/**
 * Registers one `it` per row exercising a token entrypoint's failure cases. Must be called inside a
 * `describe` block; `getRefs` is invoked inside each test body so it reads handles populated in `beforeAll`.
 */
export function runTokenFailureCases(
  getRefs: () => TokenFailureRefs,
  entrypoint: TokenFailureEntrypoint,
  rows: TokenFailureRow[],
): void {
  for (const row of rows) {
    it(row.title ?? DEFAULT_TITLES[row.failureMode], async () => {
      await runFailureMode(getRefs(), entrypoint, row);
    });
  }
}

/**
 * Deploys an {@link AMMContract} over three freshly deployed tokens (token0, token1, and the liquidity
 * token), makes the AMM the liquidity token's minter, and mints `initialBalance` of token0 and token1 to
 * each liquidity provider plus token0 to the swapper. `deploy` selects the token flavour (Token vs
 * TestToken), so the concrete token type flows through to the caller.
 */
export async function deployAmmWithTokens<T extends AnyTokenContract>(
  wallet: Wallet,
  admin: AztecAddress,
  deploy: (wallet: Wallet, admin: AztecAddress, initialBalance: bigint, logger: Logger) => Promise<{ contract: T }>,
  opts: { liquidityProviders: AztecAddress[]; swapper: AztecAddress; initialBalance: bigint; logger: Logger },
): Promise<{ token0: T; token1: T; liquidityToken: T; amm: AMMContract }> {
  const { liquidityProviders, swapper, initialBalance, logger } = opts;

  const { contract: token0 } = await deploy(wallet, admin, 0n, logger);
  const { contract: token1 } = await deploy(wallet, admin, 0n, logger);
  const { contract: liquidityToken } = await deploy(wallet, admin, 0n, logger);

  const { contract: amm } = await AMMContract.deploy(
    wallet,
    token0.address,
    token1.address,
    liquidityToken.address,
  ).send({ from: admin });

  // TODO(#9480): consider deploying the token by some factory when the AMM is deployed, and making the AMM be the
  // minter there.
  await liquidityToken.methods.set_minter(amm.address, true).send({ from: admin });

  for (const lp of liquidityProviders) {
    await mintTokensToPrivate(token0, admin, lp, initialBalance);
    await mintTokensToPrivate(token1, admin, lp, initialBalance);
  }
  // Note that the swapper only holds token0, not token1.
  await mintTokensToPrivate(token0, admin, swapper, initialBalance);

  return { token0, token1, liquidityToken, amm };
}
