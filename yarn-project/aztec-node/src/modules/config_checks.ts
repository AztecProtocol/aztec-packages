import type { AztecNodeConfig } from '../aztec-node/config.js';

/**
 * Verifies the node's configured L1 timing matches the rollup it is pointed at, for the fields the node's own
 * config carries. Each comparison is guarded against an undefined config value, so a config that does not carry
 * a field is not checked. Throws a single error listing every mismatch. Runs in the startup path for every node
 * role; a follower node reads the reference values from its upstream instead of from the rollup contract.
 */
export function checkConfigMatchesRollup(
  config: Pick<AztecNodeConfig, 'aztecSlotDuration' | 'aztecEpochDuration'>,
  rollup: { slotDuration: number; epochDuration: number },
): void {
  const mismatches: string[] = [];
  if (config.aztecSlotDuration !== undefined && config.aztecSlotDuration !== rollup.slotDuration) {
    mismatches.push(`aztecSlotDuration is ${config.aztecSlotDuration} but the rollup reports ${rollup.slotDuration}`);
  }
  if (config.aztecEpochDuration !== undefined && config.aztecEpochDuration !== rollup.epochDuration) {
    mismatches.push(
      `aztecEpochDuration is ${config.aztecEpochDuration} but the rollup reports ${rollup.epochDuration}`,
    );
  }
  if (mismatches.length > 0) {
    throw new Error(
      `The node's configured L1 timing does not match the rollup contract it is pointed at: ${mismatches.join('; ')}`,
    );
  }
}
