import { AppendOnlyTreeSnapshot, GlobalVariables, Header } from '@aztec/circuits.js';
import { MerkleTreeOperations } from '@aztec/world-state';

/**
 * Builds the initial header by reading the roots from the database.
 *
 * TODO(#4148) Proper genesis state. If the state is empty, we allow anything for now.
 */
export async function buildInitialHeader(db: MerkleTreeOperations, globalVariables: GlobalVariables | undefined = undefined) {
  const state = await db.getStateReference();
  globalVariables = globalVariables ?? GlobalVariables.empty();
  return new Header(AppendOnlyTreeSnapshot.empty(), Buffer.alloc(32, 0), state, globalVariables);
}
