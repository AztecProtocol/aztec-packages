/**
 * Fee-juice bridging for the `fee-juice` deploy policy: bridge Fee Juice from L1, wait for the
 * L1→L2 message to become available, and hand back a claim to spend inside the recipient's first
 * tx. Node-only (pulls in `@aztec/aztec.js/ethereum` + viem).
 *
 * `bridge()` does NOT send the L2 claim tx — the caller feeds the returned claim into
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
import { type AztecNodeDebug, createAztecNodeDebugClient } from '@aztec/stdlib/interfaces/client';

import type { Hex } from 'viem';
import { generatePrivateKey } from 'viem/accounts';

const POLL_INTERVAL_MS = 1000;
const WARP_BY_SECONDS = 36n; // roughly one L2 slot

/** Local vs. remote L1→L2 message advancement: warp cheats time forward, poll just waits. */
export type BridgeTimingMode = 'warp' | 'poll';

export interface BridgeParams {
  node: AztecNode;
  recipient: AztecAddress;
  l1RpcUrl: string;
  l1ChainId: number;
  /** Desired amount (wei). Ignored on the faucet/mint path. */
  amount?: bigint;
  l1PrivateKey?: Hex;
  mode: BridgeTimingMode;
  /** Local-only overrides for the warp path. */
  warpOpts?: { nodeUrl?: string };
  timeoutMs?: number;
}

export interface BridgeResult {
  /** Exact shape `FeeJuicePaymentMethodWithClaim` expects. */
  claim: Awaited<ReturnType<typeof bridgeFeeJuice>>['claim'];
  l1Address: string;
  /** Whether the faucet/mint path was taken. */
  minted: boolean;
}

/**
 * Bridges fee juice from L1 and waits until the L1→L2 message is available on the node. Does not
 * send the L2 claim tx — feed the returned claim into `FeeJuicePaymentMethodWithClaim`.
 */
export async function bridge(params: BridgeParams): Promise<BridgeResult> {
  const { claim, l1Address, minted } = await bridgeFeeJuice({
    node: params.node,
    l1RpcUrl: params.l1RpcUrl,
    l1ChainId: params.l1ChainId,
    recipient: params.recipient,
    amount: params.amount,
    l1PrivateKey: params.l1PrivateKey,
  });

  const messageHash = Fr.fromHexString(claim.messageHash);
  await waitForL1ToL2Message({
    node: params.node,
    messageHash,
    mode: params.mode,
    timeoutMs: params.timeoutMs,
    warpOpts: params.warpOpts,
  });

  return { claim, l1Address, minted };
}

export interface BridgeFeeJuiceParams {
  node: AztecNode;
  l1RpcUrl: string;
  l1ChainId: number;
  recipient: AztecAddress;
  /** Desired amount in wei (non-faucet path only; the faucet's `mintAmount()` wins otherwise). */
  amount?: bigint;
  /** L1 private key signing the bridge tx. When omitted, a fresh ephemeral key is generated. */
  l1PrivateKey?: Hex;
}

export interface BridgeFeeJuiceResult {
  claim: Awaited<ReturnType<L1FeeJuicePortalManager['bridgeTokensPublic']>>;
  l1Address: string;
  minted: boolean;
}

/**
 * Bridges fee juice to an L2 recipient. Mirrors the bridge UI's decision:
 *   - faucet handler exists AND L1 signer holds little FJ → mint via the handler
 *   - otherwise → transfer the caller's existing FJ balance to the portal
 *
 * Throws only if neither path is viable (handler missing AND signer has no FJ, or non-faucet path
 * requested with no `amount`).
 */
export async function bridgeFeeJuice(params: BridgeFeeJuiceParams): Promise<BridgeFeeJuiceResult> {
  const { node, l1RpcUrl, l1ChainId, recipient } = params;

  const l1PrivateKey: Hex = params.l1PrivateKey ?? generatePrivateKey();
  const chain = createEthereumChain([l1RpcUrl], l1ChainId);
  const l1Client = createExtendedL1Client(chain.rpcUrls, l1PrivateKey, chain.chainInfo);
  const portalManager = await L1FeeJuicePortalManager.new(node, l1Client, createLogger('deploy:bridging'));

  const tokenManager = portalManager.getTokenManager();
  const hasFaucet = tokenManager.handlerAddress !== undefined;
  const signerAddress = l1Client.account.address;
  const l1Balance = await tokenManager.getL1TokenBalance(signerAddress);

  // Mint via the faucet unless the signer already holds "enough" FJ. 10 FJ covers any single bridge
  // here; using a threshold (not `=== 0`) avoids skipping the mint when the signer holds leftover
  // dust from a previous run, which would trip ERC20InsufficientBalance.
  const FAUCET_SKIP_THRESHOLD = 10n * 10n ** 18n;
  const minted = hasFaucet && l1Balance < FAUCET_SKIP_THRESHOLD;
  if (!minted && !hasFaucet && l1Balance < FAUCET_SKIP_THRESHOLD) {
    throw new Error(
      `L1 signer ${signerAddress} holds ${l1Balance} FJ (below threshold) and no fee-asset handler is available for minting.`,
    );
  }

  let amountArg: bigint | undefined;
  if (minted) {
    amountArg = undefined;
  } else {
    if (params.amount === undefined) {
      throw new Error(
        `bridgeFeeJuice: \`amount\` is required when the faucet path is not used (L1 signer holds ${l1Balance} FJ).`,
      );
    }
    amountArg = params.amount;
  }

  const claim = await portalManager.bridgeTokensPublic(recipient, amountArg, minted);
  return { claim, l1Address: signerAddress, minted };
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
  /** Warp-only override for the node debug URL. */
  warpOpts?: { nodeUrl?: string };
}

/** Waits until an L1→L2 message is available on the node (warping time forward in `warp` mode). */
export async function waitForL1ToL2Message(params: WaitForClaimParams): Promise<void> {
  const { node, messageHash, mode } = params;

  if (mode === 'warp') {
    await advanceL1ToL2Message(node, messageHash, {
      ...params.warpOpts,
      timeoutMs: params.timeoutMs ?? 120_000,
    });
    return;
  }

  const startedAt = Date.now();
  const timeoutMs = params.timeoutMs ?? 30 * 60_000;
  const deadline = startedAt + timeoutMs;
  let lastLog = startedAt;
  while (Date.now() < deadline) {
    if (await isL1ToL2MessageReady(node, messageHash)) {
      return;
    }
    if (Date.now() - lastLog > 30_000) {
      lastLog = Date.now();
    }
    await new Promise(r => setTimeout(r, 5_000));
  }
  throw new Error(`L1→L2 message ${messageHash.toString()} did not become available in time`);
}

/**
 * Local-network helper: advances L1 + L2 time via the node debug API until the given L1→L2 message
 * shows up as available. `warpL2TimeAtLeastBy` needs `AztecNode & AztecNodeDebug` (it reads the
 * current L1 timestamp via the regular API before warping); both clients target the same URL and
 * expose their methods as own properties on the rpc proxy, so a shallow merge is safe.
 */
export async function advanceL1ToL2Message(
  node: AztecNode,
  messageHash: Fr,
  opts: { nodeUrl?: string; timeoutMs?: number } = {},
): Promise<void> {
  const nodeUrl = opts.nodeUrl ?? process.env.AZTEC_NODE_URL ?? 'http://localhost:8080';
  const timeoutMs = opts.timeoutMs ?? 120_000;

  const fullNode = Object.assign({}, node, createAztecNodeDebugClient(nodeUrl)) as AztecNode & AztecNodeDebug;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isL1ToL2MessageReady(node, messageHash)) {
      return;
    }
    await fullNode.warpL2TimeAtLeastBy(Number(WARP_BY_SECONDS));
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`L1→L2 message ${messageHash.toString()} did not become available in time`);
}
