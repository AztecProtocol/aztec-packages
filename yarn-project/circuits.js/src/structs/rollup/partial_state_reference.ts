import { AppendOnlyTreeSnapshot } from './append_only_tree_snapshot.js';

/**
 * Stores snapshots of trees which are commonly needed by base or merge rollup circuits.
 */
export class PartialStateReference {
  constructor(
    /** Snapshot of the note hash tree. */
    public readonly noteHashTree: AppendOnlyTreeSnapshot,
    /** Snapshot of the nullifier tree. */
    public readonly nullifierTree: AppendOnlyTreeSnapshot,
    /** Snapshot of the contract tree. */
    public readonly contractTree: AppendOnlyTreeSnapshot,
    /** Snapshot of the public data tree. */
    public readonly publicDataTree: AppendOnlyTreeSnapshot,
  ) {}
}
