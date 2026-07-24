import type { AztecNodeService } from '@aztec/aztec-node';
import type { AztecNodeConfig } from '@aztec/aztec-node/config';
import type { Fr } from '@aztec/aztec.js/fields';
import { startAnvil } from '@aztec/ethereum/test';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { foundry } from 'viem/chains';

import { createLocalNetwork } from '../local-network/local-network.js';

/** A running in-process local network: an inline Aztec node backed by its own anvil L1. */
export interface LocalNetwork extends AsyncDisposable {
  /** Fully-synced Aztec node, ready to serve client requests. */
  node: AztecNodeService;
  /** RPC URL of the spawned anvil instance. */
  l1RpcUrl: string;
  /** Chain id used on L1 (foundry's default 31337). */
  l1ChainId: number;
  /** Stops every process started by the fixture: node and anvil. Also invoked by `await using`. */
  stop: () => Promise<void>;
}

/** Options for {@link setupLocalNetwork}. */
export interface LocalNetworkOptions {
  /**
   * Addresses that should hold fee juice at genesis. Saves each of these the round-trip of bridging
   * + claiming fee juice before they can pay for gas.
   */
  fundedAddresses?: AztecAddress[];
  /** Override the default per-address genesis fee juice granted to {@link fundedAddresses}. */
  initialAccountFeeJuice?: Fr;
  /** Node config overrides, e.g. `realProofs`, `aztecEpochDuration`, `p2pEnabled`. */
  config?: Partial<AztecNodeConfig>;
}

/**
 * Spin up an in-process local network with the given addresses pre-funded.
 *
 * Each call spawns its own anvil on an OS-assigned random port and runs the Aztec node inline via
 * the same {@link createLocalNetwork} codepath that backs `aztec start --local-network` (with the
 * sandbox account/FPC/token setup skipped). Distinct ports let independent suites run in parallel.
 * The caller must `await result.stop()` in its teardown (or hold the result with `await using`).
 *
 * Requires a Foundry toolchain (`anvil`/`forge`), installed via `aztec-up` or `foundryup`. Binaries
 * are located in the standard install directories or on `PATH`; set `$ANVIL_BIN` / `$FORGE_BIN` to
 * pin specific ones.
 */
export async function setupLocalNetwork(opts: LocalNetworkOptions = {}): Promise<LocalNetwork> {
  // `--port 0` → anvil binds an ephemeral port that `startAnvil` reads back, so parallel suites
  // never collide on a fixed port.
  const { rpcUrl, stop: stopAnvil } = await startAnvil({ port: 0 });

  try {
    const { node, stop: stopNode } = await createLocalNetwork(
      {
        ...opts.config,
        l1RpcUrls: [rpcUrl],
        testAccounts: false,
        prefundAddresses: (opts.fundedAddresses ?? []).map(a => a.toString()),
        initialAccountFeeJuice: opts.initialAccountFeeJuice,
      },
      () => {},
    );

    // Stop the node before anvil (its teardown still talks to L1); the finally guarantees anvil is
    // reaped even if node shutdown throws.
    const stop = async () => {
      try {
        await stopNode();
      } finally {
        await stopAnvil();
      }
    };

    return {
      node,
      l1RpcUrl: rpcUrl,
      l1ChainId: foundry.id,
      stop,
      [Symbol.asyncDispose]: stop,
    };
  } catch (err) {
    await stopAnvil();
    throw err;
  }
}

/**
 * Min-fee padding multiplier for test wallets whose txs may mine well after their fee estimate.
 * The automine sequencer builds one block per tx and advances L1 time in big jumps, and proposer
 * pipelining evolves the fee-asset price across the build/publish gap (~20x observed in CI), so the
 * network's congestion base fee can swing sharply between the wallet's fee estimate and the block
 * the tx actually lands in. The default wallet padding isn't enough and trips
 * `maxFeesPerGas.feePerL2Gas must be >= gasFees.feePerL2Gas`. Apply via
 * `wallet.setMinFeePadding(TEST_FEE_PADDING)` on every test wallet that sends txs.
 */
export const TEST_FEE_PADDING = 30;
