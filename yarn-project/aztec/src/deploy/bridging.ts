/**
 * Fee-juice bridging for the `fee-juice` deploy policy: bridge Fee Juice from L1
 * ({@link bridgeFeeJuice}) and wait for the L1→L2 message to become available
 * ({@link waitForL1ToL2Message}). Fee Juice only — this is not a generic L1→L2 asset bridge.
 * Node-only (pulls in `@aztec/aztec.js/ethereum` + viem).
 *
 * Nothing here sends the L2 claim tx — the caller feeds the returned claim into
 * `FeeJuicePaymentMethodWithClaim` so the claim lands inside whatever tx the recipient is already
 * sending.
 */
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { L1FeeJuicePortalManager } from '@aztec/aztec.js/ethereum';
import { isL1ToL2MessageReady } from '@aztec/aztec.js/messaging';
import type { AztecNode } from '@aztec/aztec.js/node';
import { createEthereumChain } from '@aztec/ethereum/chain';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { type AztecNodeDebug, createAztecNodeDebugClient } from '@aztec/stdlib/interfaces/client';

import type { Hex } from 'viem';
import { generatePrivateKey } from 'viem/accounts';

const logger = createLogger('deploy:bridging');

/** Wait between availability checks in `warp` mode — each iteration also warps the clock forward. */
const WARP_POLL_INTERVAL_MS = 1000;
/** Wait between availability checks in `poll` mode (a real network; nothing to do but wait). */
const POLL_INTERVAL_MS = 5_000;
/** Throttle for the "still waiting" progress log in the poll loop. */
const POLL_LOG_INTERVAL_MS = 30_000;

/** Local vs. remote L1→L2 message advancement: warp cheats time forward, poll just waits. */
export type BridgeTimingMode = 'warp' | 'poll';

/** The claim produced by bridging: exactly the shape `FeeJuicePaymentMethodWithClaim` expects. */
export type FeeJuiceClaim = Awaited<ReturnType<L1FeeJuicePortalManager['bridgeTokensPublic']>>;

/**
 * Decides how the L1 signer funds a bridge: mint from the fee-asset faucet handler, or transfer
 * its existing Fee Juice. Pure — exercised directly by unit tests.
 *
 * - Balance covers the requested amount → transfer it (no mint, even when a faucet exists).
 * - Balance short of the amount + faucet available → mint (the faucet path bridges the handler's
 *   own mint amount and ignores `amount`).
 * - Balance short + no faucet → throw, reporting the shortfall.
 * - No `amount` requested → the faucet is required (there is nothing to size a transfer by).
 */
export function pickBridgeRoute(opts: { hasFaucet: boolean; l1Balance: bigint; amount?: bigint }): {
  useFaucet: boolean;
  amount?: bigint;
} {
  const { hasFaucet, l1Balance, amount } = opts;
  if (amount === undefined) {
    if (!hasFaucet) {
      throw new Error('bridgeFeeJuice: `amount` is required when no fee-asset faucet is available.');
    }
    return { useFaucet: true };
  }
  if (l1Balance >= amount) {
    return { useFaucet: false, amount };
  }
  if (hasFaucet) {
    return { useFaucet: true };
  }
  throw new Error(
    `L1 signer holds ${l1Balance} wei of Fee Juice but ${amount} was requested, and no fee-asset faucet is ` +
      `available to mint the difference.`,
  );
}

export interface BridgeFeeJuiceParams {
  node: AztecNode;
  l1RpcUrl: string;
  l1ChainId: number;
  recipient: AztecAddress;
  /** Desired amount in wei. Optional only when a faucet exists (whose `mintAmount()` then wins). */
  amount?: bigint;
  /** L1 private key signing the bridge tx. When omitted, a fresh ephemeral key is generated. */
  l1PrivateKey?: Hex;
}

/**
 * Bridges fee juice to an L2 recipient, minting from the faucet handler or transferring the
 * signer's balance per {@link pickBridgeRoute}. Returns the claim; the L1→L2 message it references
 * becomes available later — see {@link waitForL1ToL2Message}.
 */
export async function bridgeFeeJuice(params: BridgeFeeJuiceParams): Promise<FeeJuiceClaim> {
  const { node, l1RpcUrl, l1ChainId, recipient } = params;

  const l1PrivateKey: Hex = params.l1PrivateKey ?? generatePrivateKey();
  const chain = createEthereumChain([l1RpcUrl], l1ChainId);
  const l1Client = createExtendedL1Client(chain.rpcUrls, l1PrivateKey, chain.chainInfo);
  const portalManager = await L1FeeJuicePortalManager.new(node, l1Client, logger);

  const tokenManager = portalManager.getTokenManager();
  const route = pickBridgeRoute({
    hasFaucet: tokenManager.handlerAddress !== undefined,
    l1Balance: await tokenManager.getL1TokenBalance(l1Client.account.address),
    amount: params.amount,
  });
  return await portalManager.bridgeTokensPublic(recipient, route.amount, route.useFaucet);
}

export interface WaitForClaimParams {
  node: AztecNode;
  messageHash: Fr;
  /**
   * On `warp` (local) we cheat L1+L2 time forward via the node debug API until the message shows as
   * available; on `poll` (every other network) we just check periodically.
   */
  mode: BridgeTimingMode;
  /** Timeout before giving up (default 30 min for poll, 2 min for warp). */
  timeoutMs?: number;
  /** Warp-only: options for reaching the node's debug API. */
  warpOpts?: { nodeUrl?: string };
}

/** Waits until an L1→L2 message is available on the node (warping time forward in `warp` mode). */
export async function waitForL1ToL2Message(params: WaitForClaimParams): Promise<void> {
  const { node, messageHash, mode } = params;

  if (mode === 'warp') {
    await warpToL1ToL2Message(node, messageHash, {
      ...params.warpOpts,
      timeoutMs: params.timeoutMs ?? 120_000,
    });
    return;
  }

  const timeoutMs = params.timeoutMs ?? 30 * 60_000;
  const startedAt = Date.now();
  let lastLog = startedAt;
  await retryUntil(
    async () => {
      if (await isL1ToL2MessageReady(node, messageHash)) {
        return true;
      }
      if (Date.now() - lastLog > POLL_LOG_INTERVAL_MS) {
        lastLog = Date.now();
        logger.info('Still waiting for L1→L2 message to become available', {
          messageHash: messageHash.toString(),
          elapsedMs: Date.now() - startedAt,
          timeoutMs,
        });
      }
      return undefined;
    },
    `L1→L2 message ${messageHash.toString()}`,
    timeoutMs / 1000,
    POLL_INTERVAL_MS / 1000,
  );
}

/**
 * Local-network helper: advances L1 + L2 time via the node debug API until the given L1→L2 message
 * shows up as available, warping by one L2 slot (read from the node's rollup constants) per check.
 * `warpL2TimeAtLeastBy` needs `AztecNode & AztecNodeDebug` (it reads the current L1 timestamp via
 * the regular API before warping); both clients target the same URL and expose their methods as own
 * properties on the rpc proxy, so a shallow merge is safe.
 */
export async function warpToL1ToL2Message(
  node: AztecNode,
  messageHash: Fr,
  opts: { nodeUrl?: string; timeoutMs?: number } = {},
): Promise<void> {
  const nodeUrl = opts.nodeUrl ?? 'http://localhost:8080';
  const timeoutMs = opts.timeoutMs ?? 120_000;

  const fullNode = Object.assign({}, node, createAztecNodeDebugClient(nodeUrl)) as AztecNode & AztecNodeDebug;
  const { slotDuration } = await node.getL1Constants();

  await retryUntil(
    async () => {
      if (await isL1ToL2MessageReady(node, messageHash)) {
        return true;
      }
      await fullNode.warpL2TimeAtLeastBy(slotDuration);
      return undefined;
    },
    `L1→L2 message ${messageHash.toString()} (warping)`,
    timeoutMs / 1000,
    WARP_POLL_INTERVAL_MS / 1000,
  );
}
