import { AppendOnlyTreeSnapshot, GlobalVariables, Header } from '@aztec/circuits.js';
import { MerkleTreeOperations } from '@aztec/world-state';

/**
 * Builds the initial header by reading the roots from the database.
 */
export async function buildInitialHeader(
  db: MerkleTreeOperations,
  prevBlockGlobalVariables: GlobalVariables = GlobalVariables.empty(), // TODO(benesjan): this should most likely be removed
) {
  const state = await db.getStateReference();
  return new Header(
    AppendOnlyTreeSnapshot.empty(), // TODO(benesjan): is it correct that last archive is 0?
    Buffer.alloc(32, 0),
    state,
    prevBlockGlobalVariables,
  );
}
