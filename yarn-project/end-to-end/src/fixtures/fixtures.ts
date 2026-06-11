import type { AztecNode } from '@aztec/aztec.js/node';
import type { GasFees } from '@aztec/stdlib/gas';

export const METRICS_PORT = 4318;

/** Default fee padding applied to predicted min fees in e2e tests. */
export const DEFAULT_MIN_FEE_PADDING = 5;

/**
 * Large fee padding for txs that may be mined significantly later than when they were created,
 * such as cloned txs in throughput/capacity benchmarks, where fees may spike between creation and mining.
 */
export const LARGE_MIN_FEE_PADDING = 15;

/**
 * Fee padding used by tests running under proposer pipelining. Under pipelining the fee-asset
 * price modifier evolves faster across the build/publish gap, so client-set maxFeesPerGas (sized
 * for the default 5x padding) was getting bumped past by the time the tx mined a few slots later.
 * Observed worst case in CI: fee evolved ~20x between PXE snapshot and inclusion, exceeding even
 * LARGE_MIN_FEE_PADDING (15x).
 */
export const PIPELINED_FEE_PADDING = 30;

/**
 * Setup option preset that opts a test into proposer pipelining. Use with `setup()`:
 *
 *     await setup(N, { ...PIPELINING_SETUP_OPTS, ...otherOpts });
 *
 * The preset runs the production Sequencer with the always-enforced timetable at real (wall-clock)
 * timing, yielding exactly 2 blocks per slot. It sets:
 * - `inboxLag: 2` so the sequencer sources L1->L2 messages from checkpoint N-1 (already sealed),
 *   avoiding `L1ToL2MessagesNotReadyError` when building for slot N during slot N-1.
 * - `minTxsPerBlock: 0` so empty checkpoints land even when a tx arrives late in the build window
 *   (otherwise the chain stalls on alternating slots).
 * - `aztecSlotDuration: 12` / `ethereumSlotDuration: 4` so the pipelined cycle fits inside the
 *   default 300s Jest hook budget. Tests that depend on the env-default 72s/12s should override.
 * - `blockDurationMs: 3000` to cut exactly 2 blocks per slot. With `ethereumSlotDuration < 8` the
 *   timing model normalizes to `init=0.5`, `assemble=0.5`, `P=0`, `minExec=1`, so
 *   `maxBlocks = floor((S - init - (assemble + 2P + D)) / D) = floor((12 - 0.5 - (0.5 + 0 + 3)) / 3)
 *   = floor(8/3) = 2`. (`blockDurationMs: 2000` would give 4 blocks/slot; 3000 also matches the
 *   production default.)
 * - `walletMinFeePadding: PIPELINED_FEE_PADDING` (30x) to absorb the wider fee evolution window.
 */
export const PIPELINING_SETUP_OPTS = {
  inboxLag: 2,
  minTxsPerBlock: 0,
  aztecSlotDuration: 12,
  ethereumSlotDuration: 4,
  blockDurationMs: 3000,
  walletMinFeePadding: PIPELINED_FEE_PADDING,
} as const;

/**
 * Setup option preset that opts a test into the deterministic AutomineSequencer path.
 * Use only for single-sequencer tests that don't exercise block-building or consensus
 * (e.g. e2e_token, e2e_amm, e2e_authwit). Not compatible with `e2e_p2p/*`,
 * `e2e_epochs/*`, `e2e_slashing/*`, `e2e_block_building`, or any multi-validator suite.
 *
 *     await setup(N, { ...AUTOMINE_E2E_OPTS, ...otherOpts });
 *
 * The preset:
 * - Swaps the production Sequencer for an AutomineSequencer that builds one block per
 *   submitted tx, publishes synchronously to L1, and owns all time control through a
 *   serial queue (see `sequencer-client/src/sequencer/automine/automine_sequencer.ts`).
<<<<<<< HEAD
 * - Disables the validator client and AnvilTestWatcher (the AutomineSequencer needs
 *   neither).
=======
 * - Disables the validator client (the AutomineSequencer needs none).
>>>>>>> ab5413c72dc (feat: merge-train/spartan-v5 (#23975))
 * - Uses `inboxLag: 1` (synchronous) since the AutomineSequencer publishes one block per tx.
 * - Switches anvil into automine mode at setup time (no interval mining); each L1 tx
 *   mines an L1 block immediately.
 *
 * Requires `aztecTargetCommitteeSize: 0`, which is the e2e default at `setup.ts:317`.
 */
export const AUTOMINE_E2E_OPTS = {
  useAutomineSequencer: true,
<<<<<<< HEAD
  disableAnvilTestWatcher: true,
=======
>>>>>>> ab5413c72dc (feat: merge-train/spartan-v5 (#23975))
  inboxLag: 1,
  minTxsPerBlock: 0,
  aztecSlotDuration: 12,
  ethereumSlotDuration: 4,
  walletMinFeePadding: PIPELINED_FEE_PADDING,
} as const;

/** Returns worst-case predicted min fees with padding applied, mirroring the BaseWallet pattern. */
export async function getPaddedMaxFeesPerGas(node: AztecNode, padding = DEFAULT_MIN_FEE_PADDING): Promise<GasFees> {
  const predicted = await node.getPredictedMinFees();
  const worstCase =
    predicted.length > 0
      ? predicted.reduce((worst, fees) => (fees.feePerL2Gas > worst.feePerL2Gas ? fees : worst))
      : await node.getCurrentMinFees();
  return worstCase.mul(1 + padding);
}

export const shouldCollectMetrics = () => {
  if (process.env.COLLECT_METRICS) {
    return METRICS_PORT;
  }
  return undefined;
};

/** Returns the boot node UDP port from environment variable or default value. */
export function getBootNodeUdpPort(): number {
  return process.env.BOOT_NODE_UDP_PORT ? parseInt(process.env.BOOT_NODE_UDP_PORT, 10) : 4500;
}

/** Returns the anvil port from environment variable or default value. */
export function getAnvilPort(): number {
  return process.env.ANVIL_PORT ? parseInt(process.env.ANVIL_PORT, 10) : 8545;
}

export const TEST_PEER_CHECK_INTERVAL_MS = 1000;
export const TEST_MAX_PENDING_TX_POOL_COUNT = 10_000; // Number of max pending TXs ~ 1.56GB

export const MNEMONIC = 'test test test test test test test test test test test junk';
export const privateKey = Buffer.from('ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', 'hex');
export const privateKey2 = Buffer.from('59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', 'hex');

/// Common errors
export const U128_UNDERFLOW_ERROR = 'Assertion failed: attempt to subtract with overflow';
export const U128_OVERFLOW_ERROR = 'Assertion failed: attempt to add with overflow';
export const BITSIZE_TOO_BIG_ERROR = "Assertion failed: call to assert_max_bit_size 'self.__assert_max_bit_size'";
// TODO(https://github.com/AztecProtocol/aztec-packages/issues/5818): Make these a fixed error after transition.
export const DUPLICATE_NULLIFIER_ERROR = /dropped|nullifier|reverted/i;
export const NO_L1_TO_L2_MSG_ERROR =
  /No non-nullified L1 to L2 message found for message hash|Tried to consume nonexistent L1-to-L2 message/;
export const STATIC_CALL_STATE_MODIFICATION_ERROR = /Static call cannot update the state.*/;
export const STATIC_CONTEXT_ASSERTION_ERROR = /Assertion failed: Function .* can only be called statically.*/;
