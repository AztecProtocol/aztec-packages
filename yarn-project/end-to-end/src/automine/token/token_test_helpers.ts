import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { ContractFunctionInteraction } from '@aztec/aztec.js/contracts';
import type { Logger } from '@aztec/aztec.js/log';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { AMMContract } from '@aztec/noir-contracts.js/AMM';
import type { GenericProxyContract } from '@aztec/noir-test-contracts.js/GenericProxy';

import { sendThroughAuthwitProxy } from '../../fixtures/authwit_proxy.js';
import { DUPLICATE_NULLIFIER_ERROR } from '../../fixtures/fixtures.js';
import { type AnyTokenContract, mintTokensToPrivate } from '../../fixtures/token_utils.js';
import type { TestWallet } from '../../test-wallet/test_wallet.js';

/** Whether an amount / balance is read from the private or public balance of the token. */
export type BalanceKind = 'private' | 'public';

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
