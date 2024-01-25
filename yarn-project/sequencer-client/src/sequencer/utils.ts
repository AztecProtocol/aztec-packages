import { AppendOnlyTreeSnapshot, Fr, GlobalVariables, Header, PartialStateReference, StateReference } from '@aztec/circuits.js';
import { MerkleTreeOperations } from '@aztec/world-state';

/**
 * Builds the initial header by reading the roots from the database.
 */
export async function buildInitialHeader(
  db: MerkleTreeOperations,
  prevBlockGlobalVariables: GlobalVariables = GlobalVariables.empty(), // TODO(benesjan): this should most likely be removed
) {
    const roots = await db.getTreeRoots();
    return new Header(
      AppendOnlyTreeSnapshot.empty(), // TODO(benesjan): is it correct that last archive is 0?
      Buffer.alloc(32, 0),
      new StateReference(
        new AppendOnlyTreeSnapshot(Fr.fromBuffer(roots.l1Tol2MessageTreeRoot), 0),
        new PartialStateReference(
          new AppendOnlyTreeSnapshot(Fr.fromBuffer(roots.noteHashTreeRoot), 0),
          new AppendOnlyTreeSnapshot(Fr.fromBuffer(roots.nullifierTreeRoot), 0),
          new AppendOnlyTreeSnapshot(Fr.fromBuffer(roots.contractDataTreeRoot), 0),
          new AppendOnlyTreeSnapshot(Fr.fromBuffer(roots.publicDataTreeRoot), 0),
        ),
      ),
      prevBlockGlobalVariables,
    );
}
