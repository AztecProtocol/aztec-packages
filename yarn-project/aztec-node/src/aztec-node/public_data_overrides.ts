import { PublicDataWrite } from '@aztec/stdlib/avm';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import type { PublicDataTreeOverride } from '@aztec/stdlib/interfaces/client';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { MerkleTreeId } from '@aztec/stdlib/trees';

/**
 * Injects public-state overrides into an ephemeral world-state fork before simulation.
 *
 * Each override is written via the same `sequentialInsert` path the public processor
 * uses during real transaction execution, so low-leaf updates and root coherence are
 * handled identically for both simulation and proof generation.
 *
 * The fork is ephemeral — these writes never reach the committed world state.
 */
export async function applyPublicDataOverrides(
  fork: MerkleTreeWriteOperations,
  publicDataOverrides: PublicDataTreeOverride[] | undefined,
): Promise<void> {
  if (!publicDataOverrides?.length) {
    return;
  }

  const writes = await Promise.all(
    publicDataOverrides.map(async o => {
      const leafSlot = await computePublicDataTreeLeafSlot(o.contract, o.slot);
      return new PublicDataWrite(leafSlot, o.value);
    }),
  );

  await fork.sequentialInsert(
    MerkleTreeId.PUBLIC_DATA_TREE,
    writes.map(w => w.toBuffer()),
  );
}
