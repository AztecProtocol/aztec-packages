/**
 * Fee handling for the deploy framework. Each account pays per its own {@link FeePolicy} — which
 * may override the spec-wide default:
 *
 * - `sponsored`  → a SponsoredFPC pays (the local-network default). All sponsored accounts share
 *   one payment method.
 * - `fee-juice`  → the account pays from its own Fee Juice; if below `threshold` with work to do,
 *   bridge `fundAmount` from L1. The bridge claim is single-use: the first paying tx claims it
 *   (`FeeJuicePaymentMethodWithClaim`) and the rest spend the balance. Pending claims are persisted
 *   (see ./state.ts) so a crash between bridge and claim resumes.
 */
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { FeeJuicePaymentMethodWithClaim, type FeePaymentMethod, SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { Fr } from '@aztec/aztec.js/fields';
import type { AztecNode } from '@aztec/aztec.js/node';
import { FeeJuiceContract } from '@aztec/aztec.js/protocol';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { GasFees } from '@aztec/stdlib/gas';

import type { Hex } from 'viem';

import { registerDeployedSponsoredFPCInWalletAndGetAddress } from '../local-network/sponsored_fpc.js';
import { bridgeFeeJuice, waitForL1ToL2Message } from './bridging.js';
import type { AccountFunding, DeployReporter } from './reporter.js';
import type { DeployState } from './state.js';
import type { FeePolicy } from './types.js';

/** Anvil's first pre-funded dev key — used as the local-network L1 funder. Published, non-secret. */
const ANVIL_DEV_KEY: Hex = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const DEFAULT_LOCAL_L1_RPC_URL = 'http://localhost:8545';
const DEFAULT_LOCAL_L1_CHAIN_ID = 31337;

/** The `fee` field of a send-options object. */
export interface SendFee {
  paymentMethod?: FeePaymentMethod;
  gasSettings?: { maxFeesPerGas: GasFees };
}

/**
 * Sane fee defaults: local pays via SponsoredFPC; every other network pays from bridged Fee Juice.
 * The threshold/fundAmount pair trades off L1 round-trips (too low → frequent re-bridges) against
 * stranding Fee Juice, which is non-transferable, on the account (too high).
 */
export function defaultFeePolicy(local: boolean): FeePolicy {
  if (local) {
    return { kind: 'sponsored' };
  }
  return {
    kind: 'fee-juice',
    threshold: 100n * 10n ** 18n, // 100 FJ
    fundAmount: 1000n * 10n ** 18n, // 1000 FJ (non-faucet fallback amount)
  };
}

/**
 * Resolves an account's funding posture under `policy` — what the plan reports and what
 * {@link prepareFeeSession} acts on. `idle` accounts (no pending work) are never funded; sponsored
 * accounts never read a balance; fee-juice accounts are `funded` iff their balance clears the
 * threshold, else `not-funded` (a bridge will top them up).
 */
export async function accountFunding(
  policy: FeePolicy,
  wallet: Wallet,
  account: AztecAddress,
  hasWork: boolean,
): Promise<AccountFunding> {
  if (!hasWork) {
    return { kind: 'idle' };
  }
  if (policy.kind === 'sponsored') {
    return { kind: 'sponsored' };
  }
  const feeJuice = FeeJuiceContract.at(wallet);
  const { result } = await feeJuice.methods.balance_of_public(account).simulate({ from: account });
  const balance = BigInt(result.toString());
  return balance >= policy.threshold
    ? { kind: 'funded', balance }
    : { kind: 'not-funded', balance, fundAmount: policy.fundAmount };
}

/** Per-account fee dispensing for one run, prepared by {@link prepareFeeSession}. */
export interface FeeSession {
  /**
   * Fee options for the next tx from `account`, plus `onConsumed` to call after it lands (clears a
   * one-time bridge claim from persisted state). Subsequent calls pay from balance.
   */
  next(account: AztecAddress): { fee: SendFee; onConsumed: () => void };
  /**
   * Whether `account`'s next tx will carry its one-time bridge claim. The runner serializes such an
   * account's first tx: the claim must mine before its balance-paying txs fan out.
   */
  hasPendingClaim(account: AztecAddress): boolean;
}

/** What {@link prepareFeeSession} needs to fund a run's working accounts. */
export interface PrepareFeeSessionOpts {
  /** Whether the target is a local (anvil) network — drives warp-vs-poll + L1 defaults. */
  local: boolean;
  node: AztecNode;
  /** The node's URL — reaches its debug API for local time-warping while a bridge settles. */
  nodeUrl?: string;
  wallet: Wallet;
  /**
   * Working accounts (those with pending work) with their resolved {@link FeePolicy} + funding (from
   * {@link accountFunding}) — so this function doesn't re-read balances.
   */
  accounts: { address: AztecAddress; policy: FeePolicy; funding: AccountFunding }[];
  state: DeployState;
  persist: () => void;
  reporter: DeployReporter;
}

/**
 * Resolves fees ahead of execution, per account: registers the shared SponsoredFPC (for sponsored
 * accounts), or tops up a fee-juice account via a bridge (reusing a persisted pending claim when
 * present). Returns a {@link FeeSession} that dispenses the right fee per tx, by sending account.
 */
export async function prepareFeeSession(opts: PrepareFeeSessionOpts): Promise<FeeSession> {
  const { local, node, nodeUrl, wallet, accounts, state, persist, reporter } = opts;

  // Shared sponsored payment method: register the SponsoredFPC + read gas once, if anyone uses it.
  let sponsoredFee: SendFee | undefined;
  if (accounts.some(a => a.policy.kind === 'sponsored')) {
    const sponsoredFPCAddress = await registerDeployedSponsoredFPCInWalletAndGetAddress(wallet);
    sponsoredFee = {
      paymentMethod: new SponsoredFeePaymentMethod(sponsoredFPCAddress),
      // 10x headroom because this one quote is reused for every tx in the run (the wallet's default would re-quote
      // per tx at 1.5x min): congestion pricing can push the min fee well past the starting quote over a run of
      // parallel layers. Overstating the cap is free — txs pay the going rate, not the cap, and the FPC pays anyway.
      gasSettings: { maxFeesPerGas: (await node.getCurrentMinFees()).mul(10) },
    };
  }

  // Bridge fee-juice top-ups. The L1 sends stay sequential — a shared funder key would collide on
  // nonces — but the L1→L2 availability waits (the minutes-long part on a real network) run
  // concurrently afterwards. Warp-mode waits run inline instead: warping manipulates global time,
  // so concurrent warps would fight. Each claim persists as soon as it exists on L1, so a crash
  // mid-wait resumes it instead of stranding the bridged funds; a resumed claim skips the wait (by
  // resume time the message is available on any live network).
  const claims = new Map<string, FeeJuicePaymentMethodWithClaim>();
  const messageWaits: Promise<void>[] = [];
  for (const { address, policy, funding } of accounts) {
    if (policy.kind !== 'fee-juice' || funding.kind === 'funded') {
      continue;
    }
    const key = address.toString();
    let stored = state.pendingClaims[key];
    if (stored) {
      reporter.onBridge?.({ recipient: address, amount: BigInt(stored.claimAmount), reused: true });
    } else {
      reporter.onBridge?.({ recipient: address, amount: policy.fundAmount, reused: false });
      // Local defaults to anvil; a non-local network must supply L1 connection details.
      const l1RpcUrl = policy.l1RpcUrl ?? (local ? DEFAULT_LOCAL_L1_RPC_URL : undefined);
      const l1ChainId = policy.l1ChainId ?? (local ? DEFAULT_LOCAL_L1_CHAIN_ID : undefined);
      if (l1RpcUrl === undefined || l1ChainId === undefined) {
        throw new Error(
          'fee-juice policy on a non-local network requires `l1RpcUrl` and `l1ChainId` (no hardcoded defaults).',
        );
      }
      const bridged = await bridgeFeeJuice({
        node,
        recipient: address,
        l1RpcUrl,
        l1ChainId,
        amount: policy.fundAmount,
        // Local: anvil's dev key (its `mint` is owner-gated, so an ephemeral key is rejected).
        // Non-local: the policy's key, else an ephemeral key + the faucet. Deliberately no env
        // fallback — the framework never reads the environment; callers pipe keys in via the policy.
        l1PrivateKey: policy.l1FunderKey ?? (local ? ANVIL_DEV_KEY : undefined),
      });
      stored = {
        claimAmount: bridged.claimAmount.toString(),
        claimSecret: bridged.claimSecret.toString(),
        messageLeafIndex: bridged.messageLeafIndex.toString(),
      };
      state.pendingClaims[key] = stored;
      persist();
      const wait = waitForL1ToL2Message({
        node,
        messageHash: Fr.fromHexString(bridged.messageHash),
        mode: local ? 'warp' : 'poll',
        ...(nodeUrl ? { warpOpts: { nodeUrl } } : {}),
      });
      if (local) {
        await wait;
      } else {
        messageWaits.push(wait);
      }
    }
    claims.set(
      key,
      new FeeJuicePaymentMethodWithClaim(address, {
        claimAmount: BigInt(stored.claimAmount),
        claimSecret: Fr.fromString(stored.claimSecret),
        messageLeafIndex: BigInt(stored.messageLeafIndex),
      }),
    );
  }
  await Promise.all(messageWaits);

  // Per-account dispenser state. A claim is single-use: the first `next()` for its account carries
  // it, and `onConsumed` (invoked by the runner once that tx mines) drops the persisted resume entry.
  const sessions = new Map<string, { sponsored: boolean; claim?: FeeJuicePaymentMethodWithClaim }>();
  for (const { address, policy } of accounts) {
    const key = address.toString();
    sessions.set(key, { sponsored: policy.kind === 'sponsored', claim: claims.get(key) });
  }

  return {
    next: account => {
      const key = account.toString();
      const session = sessions.get(key);
      if (session?.sponsored) {
        return { fee: sponsoredFee ?? {}, onConsumed: () => {} };
      }
      if (session?.claim) {
        const claim = session.claim;
        session.claim = undefined; // single-use: only this first tx carries it
        return {
          fee: { paymentMethod: claim },
          onConsumed: () => {
            // claim is now spent on-chain; drop its resume entry
            delete state.pendingClaims[key];
            persist();
          },
        };
      }
      return { fee: {}, onConsumed: () => {} }; // later txs (or already-funded): pay from the account's balance
    },
    hasPendingClaim: account => sessions.get(account.toString())?.claim !== undefined,
  };
}
