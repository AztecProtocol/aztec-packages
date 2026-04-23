import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { computeL2ToL1MessageHash } from '@aztec/stdlib/hash';

import { getWithdrawContentHash } from '../content_hash.js';
import type { TeeConfig } from '../digest.js';
import { computeRootFromSiblingPath } from '../merkle.js';

// Derive the L2-to-L1 message hash for a withdrawal exit. Used by both
// `afternoon` (digest input) and `evening` (witness verification + sig
// binding) so the two stay in lockstep.
export function computeExitMessageHash(config: TeeConfig, l1Recipient: EthAddress, exitAmount: bigint): Buffer {
  const exitContent = getWithdrawContentHash(l1Recipient, exitAmount);
  return computeL2ToL1MessageHash({
    l2Sender: config.l2Bridge,
    l1Recipient: config.l1Portal,
    content: exitContent,
    rollupVersion: new Fr(config.rollupVersion),
    chainId: new Fr(config.l1ChainId),
  }).toBuffer();
}

// Reconstruct a tree root from a leaf + sibling path and require it to
// equal `actualRoot`. `kind` is the noun ("inbox" / "outbox"); `where`
// pins the failure to a specific checkpoint or epoch in the message body.
export function assertWitnessMatchesRoot(
  kind: string,
  where: string,
  index: bigint,
  leaf: Buffer,
  siblingPath: Buffer[],
  actualRoot: Buffer,
): void {
  const derived = computeRootFromSiblingPath(leaf, siblingPath, index);
  if (!derived.equals(actualRoot)) {
    throw new Error(
      `${kind} root mismatch for ${where}: derived=0x${derived.toString('hex')} actual=0x${actualRoot.toString('hex')}`,
    );
  }
}
