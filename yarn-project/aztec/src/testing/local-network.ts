import type { AztecNodeService } from '@aztec/aztec-node';
import type { AztecNodeConfig } from '@aztec/aztec-node/config';
import type { Fr } from '@aztec/aztec.js/fields';
import { ensureAztecBinsInPath, startAnvil } from '@aztec/ethereum/test';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { foundry } from 'viem/chains';

import { createLocalNetwork } from '../local-network/local-network.js';

/** A running in-process local network: an inline Aztec node backed by its own anvil L1. */
export interface LocalNetwork {
  /** Fully-synced Aztec node, ready to serve client requests. */
  node: AztecNodeService;
  /** RPC URL of the spawned anvil instance. */
  l1RpcUrl: string;
  /** Chain id used on L1 (foundry's default 31337). */
  l1ChainId: number;
  /** Stops every process started by the fixture: node and anvil. */
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
  /** anvil block time in seconds. Omit for automine (the default). */
  l1BlockTime?: number;
}

/**
 * Spin up an in-process local network with the given addresses pre-funded.
 *
 * Each call spawns its own anvil on an OS-assigned random port and runs the Aztec node inline via
 * the same {@link createLocalNetwork} codepath that backs `aztec start --local-network` (with the
 * sandbox account/FPC/token setup skipped). Distinct ports let independent suites run in parallel.
 * The caller must `await result.stop()` in its teardown.
 *
 * Requires an `aztec-up`-installed Foundry toolchain (`anvil`/`forge`/`solc`) reachable on `PATH`;
 * {@link ensureAztecBinsInPath} splices the standard aztec-up bin directories in automatically.
 */
export async function setupLocalNetwork(opts: LocalNetworkOptions = {}): Promise<LocalNetwork> {
  // `deployAztecL1Contracts` shells out to bare `forge`/`solc`; make the aztec-up bins reachable
  // before anything spawns them. Idempotent, and also called inside `startAnvil`.
  ensureAztecBinsInPath();

  // `--port 0` → anvil binds an ephemeral port that `startAnvil` reads back, so parallel suites
  // never collide on a fixed port.
  const { rpcUrl, stop: stopAnvil } = await startAnvil({ port: 0, l1BlockTime: opts.l1BlockTime });

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

    return {
      node,
      l1RpcUrl: rpcUrl,
      l1ChainId: foundry.id,
      stop: async () => {
        await stopNode();
        await stopAnvil();
      },
    };
  } catch (err) {
    await stopAnvil();
    throw err;
  }
}

/**
 * Min-fee padding multiplier for test wallets sending txs against {@link setupLocalNetwork}. The
 * automine sequencer builds one block per tx and advances L1 time in big jumps, so the network's
 * congestion base fee can swing sharply between the wallet's fee estimate and the block the tx
 * actually lands in. The default wallet padding isn't enough and trips
 * `maxFeesPerGas.feePerL2Gas must be >= gasFees.feePerL2Gas`. Apply via
 * `wallet.setMinFeePadding(TEST_FEE_PADDING)` on every test wallet that sends txs.
 */
export const TEST_FEE_PADDING = 30;
