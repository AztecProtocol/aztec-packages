import { AppendOnlyTreeSnapshot } from './append_only_tree_snapshot.js';
import { PartialStateReference } from './partial_state_reference.js';

/**
 * Stores snapshots of all the trees but archive.
 */
export class StateReference {
  constructor(
    /** Snapshot of the l1 to l2 message tree. */
    public l1ToL2MessageTree: AppendOnlyTreeSnapshot,
    /** Reference to the rest of the state. */
    public partial: PartialStateReference,
  ) {}
}
