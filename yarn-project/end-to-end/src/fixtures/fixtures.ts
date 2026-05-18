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
 * The preset sets:
 * - `enableProposerPipelining: true` so the sequencer builds for `slot + 1`.
 * - `inboxLag: 2` so the sequencer sources L1->L2 messages from checkpoint N-1 (already sealed),
 *   avoiding `L1ToL2MessagesNotReadyError` when building for slot N during slot N-1.
 * - `minTxsPerBlock: 0` so empty checkpoints land even when a tx arrives late in the build window
 *   (otherwise the chain stalls on alternating slots).
 * - `aztecSlotDuration: 12` / `ethereumSlotDuration: 4` so the pipelined cycle fits inside the
 *   default 300s Jest hook budget. Tests that depend on the env-default 72s/12s should override.
 * - `walletMinFeePadding: PIPELINED_FEE_PADDING` (30x) to absorb the wider fee evolution window.
 */
export const PIPELINING_SETUP_OPTS = {
  enableProposerPipelining: true,
  inboxLag: 2,
  minTxsPerBlock: 0,
  aztecSlotDuration: 12,
  ethereumSlotDuration: 4,
  walletMinFeePadding: PIPELINED_FEE_PADDING,
} as const;

/**
 * Fast e2e setup preset that opts a test into proposer pipelining with the smallest possible
 * timing constants. Use this for single-sequencer, non-block-building tests.
 *
 *     await setup(N, { ...FAST_E2E_SETUP_OPTS });
 *
 * Extends PIPELINING_SETUP_OPTS with:
 * - `l1PublishingTime: 4`: L1 tx is expected to land inside one Ethereum slot.
 * - `testOnlyAutoProveAfterPublish: true`: opts the fixture into spinning up an
 *   `EpochTestSettler` that advances the outbox + proven tip once per completed epoch,
 *   replacing AnvilTestWatcher's markAsProven loop.
 *
 * Note: `aztecEpochDuration` is intentionally left at the default (32 slots). Shortening it
 * makes `EpochTestSettler` fire its `markAsProven` cheat-code while the sequencer is pipelining
 * the very next propose tx. The cheat-code path pauses anvil interval mining briefly, which is
 * enough to push the in-flight propose into the previous L2 slot's L1 block and revert with
 * `HeaderLib__InvalidSlotNumber`. Tests that explicitly need a fast proven-tip cadence should
 * either set `aztecEpochDuration` locally and accept the resulting flakiness, or run a real
 * prover-node (`startProverNode: true`).
 *
 * Auto-tuning applied by `normalizeCheckpointTimingConfig` (stdlib/src/timetable/index.ts):
 * because ethereumSlotDuration < 8, p2pPropagationTime = 0, checkpointAssembleTime = 0.5,
 * checkpointInitializationTime = 0.5, minExecutionTime = 1. `blockDurationMs` remains unset,
 * so the sequencer runs in single-block-per-slot mode:
 *
 *   minimumBuildSlotWork       = init + 2*minExec    = 0.5 + 2   = 2.5s
 *   initializeDeadline         = aztecSlotDuration - minimumBuildSlotWork  = 9.5s
 *   checkpointFinalizationTime = assemble + 2*p2p + publish = 0.5 + 0 + 4 = 4.5s
 *   maxAllowed (single block)  = aztecSlotDuration - checkpointFinalizationTime = 7.5s
 *   available at slot start    = (7.5 - 0) / 2  = 3.75s  (split: exec vs re-exec)
 *
 * The pipelined publish deadline is `2 * aztecSlotDuration - l1PublishingTime` = 20s into build slot.
 */
export const FAST_E2E_SETUP_OPTS = {
  ...PIPELINING_SETUP_OPTS,
  l1PublishingTime: 4,
  testOnlyAutoProveAfterPublish: true,
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
