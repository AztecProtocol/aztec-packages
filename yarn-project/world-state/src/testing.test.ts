import { Fr } from '@aztec/foundation/curves/bn254';
import { MerkleTreeId, PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import type { GenesisData } from '@aztec/stdlib/world-state';

import { jest } from '@jest/globals';

import { NativeWorldStateService } from './native/index.js';

jest.setTimeout(60_000);

describe('generateGenesisValues world state backend equivalence', () => {
  // A genesis with both non-empty prefilled public data and a non-zero timestamp, so the
  // fast-return branch in generateGenesisValues is not taken and the archive root is computed
  // from an actual world state.
  const genesis: GenesisData = {
    prefilledPublicData: [
      new PublicDataTreeLeaf(new Fr(1000), new Fr(2000)),
      new PublicDataTreeLeaf(new Fr(3000), new Fr(4000)),
    ],
    genesisTimestamp: 1234567890n,
  };

  const archiveRoot = async (ws: NativeWorldStateService) =>
    new Fr((await ws.getCommitted().getTreeInfo(MerkleTreeId.ARCHIVE)).root);

  // The consensus-critical guarantee behind computing genesis values on the fsync-off ephemeral
  // backend instead of tmp: both backends must derive the exact same on-chain genesis archive root.
  it('ephemeral and tmp produce identical genesis archive roots', async () => {
    const tmpWs = await NativeWorldStateService.tmp(undefined /* rollupAddress */, true /* cleanupTmpDir */, genesis);
    const ephemeralWs = await NativeWorldStateService.ephemeral(genesis);
    try {
      const tmpRoot = await archiveRoot(tmpWs);
      const ephemeralRoot = await archiveRoot(ephemeralWs);
      expect(ephemeralRoot).toEqual(tmpRoot);
    } finally {
      await tmpWs.close();
      await ephemeralWs.close();
    }
  });
});
