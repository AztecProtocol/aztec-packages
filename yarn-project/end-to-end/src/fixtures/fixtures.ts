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
