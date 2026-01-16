import { makeTreeSnapshotDiffHints } from '../tests/factories.js';
import { TreeSnapshotDiffHints } from './tree_snapshot_diff_hints.js';

describe('TreeSnapshotDiffHints', () => {
  it('serializes to buffer and deserializes it back', () => {
    const expected = makeTreeSnapshotDiffHints();
    const buffer = expected.toBuffer();
    const res = TreeSnapshotDiffHints.fromBuffer(buffer);
    expect(res).toEqual(expected);
  });
});
