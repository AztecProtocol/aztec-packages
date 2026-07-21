<<<<<<< HEAD
import { Fr } from '@aztec/foundation/curves/bn254';
import { MerkleTreeId, PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import type { GenesisData } from '@aztec/stdlib/world-state';
=======
import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { MerkleTreeId, PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import { EMPTY_GENESIS_DATA, type GenesisData } from '@aztec/stdlib/world-state';
>>>>>>> origin/v5-next

import { jest } from '@jest/globals';

import { NativeWorldStateService } from './native/index.js';
<<<<<<< HEAD

jest.setTimeout(60_000);

=======
import { getGenesisValues } from './testing.js';

jest.setTimeout(60_000);

const archiveRoot = async (ws: NativeWorldStateService) =>
  new Fr((await ws.getCommitted().getTreeInfo(MerkleTreeId.ARCHIVE)).root);

>>>>>>> origin/v5-next
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

<<<<<<< HEAD
  const archiveRoot = async (ws: NativeWorldStateService) =>
    new Fr((await ws.getCommitted().getTreeInfo(MerkleTreeId.ARCHIVE)).root);

  // The consensus-critical guarantee behind computing genesis values on the fsync-off ephemeral
  // backend instead of tmp: both backends must derive the exact same on-chain genesis archive root.
  it('ephemeral and tmp produce identical genesis archive roots', async () => {
    const tmpWs = await NativeWorldStateService.tmp(/*cleanupTmpDir=*/ true, genesis);
=======
  // The consensus-critical guarantee behind computing genesis values on the fsync-off ephemeral
  // backend instead of tmp: both backends must derive the exact same on-chain genesis archive root.
  it('ephemeral and tmp produce identical genesis archive roots', async () => {
    const tmpWs = await NativeWorldStateService.tmp(undefined /* rollupAddress */, true /* cleanupTmpDir */, genesis);
>>>>>>> origin/v5-next
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
<<<<<<< HEAD
=======

describe('genesis prefilled nullifiers', () => {
  // (a) With no public data, no timestamp and no prefilled nullifiers, generateGenesisValues takes its fast path and
  // returns the pinned GENESIS_ARCHIVE_ROOT constant without spinning up a world state.
  it('empty genesis returns the canonical GENESIS_ARCHIVE_ROOT via the fast path', async () => {
    const { genesisArchiveRoot } = await getGenesisValues([]);
    expect(genesisArchiveRoot).toEqual(new Fr(GENESIS_ARCHIVE_ROOT));
  });

  // (a) The fast-path constant must equal the root actually computed from an empty-nullifier genesis, i.e. the
  // GENESIS_ARCHIVE_ROOT constant is correct for the default (empty) prefilled-nullifiers list on this branch.
  it('the empty-genesis archive root matches a freshly computed empty world state', async () => {
    const ws = await NativeWorldStateService.ephemeral(EMPTY_GENESIS_DATA);
    try {
      expect(await archiveRoot(ws)).toEqual(new Fr(GENESIS_ARCHIVE_ROOT));
    } finally {
      await ws.close();
    }
  });

  // (b) An explicit empty prefilled-nullifiers list must be behaviour-neutral: threading it through the non-fast path
  // (public data present) yields exactly the same root as a genesis that omits the field entirely.
  it('an explicit empty prefilledNullifiers produces the same root as omitting the field', async () => {
    const publicData = [new PublicDataTreeLeaf(new Fr(1000), new Fr(2000))];
    const withoutField: GenesisData = { prefilledPublicData: publicData, genesisTimestamp: 42n };
    const withEmpty: GenesisData = { prefilledPublicData: publicData, genesisTimestamp: 42n, prefilledNullifiers: [] };
    const wsWithout = await NativeWorldStateService.ephemeral(withoutField);
    const wsEmpty = await NativeWorldStateService.ephemeral(withEmpty);
    try {
      expect(await archiveRoot(wsEmpty)).toEqual(await archiveRoot(wsWithout));
    } finally {
      await wsWithout.close();
      await wsEmpty.close();
    }
  });

  // (c) A non-empty, sorted, unique nullifier list produces a deterministic root that differs from the empty genesis.
  it('a non-empty prefilledNullifiers list yields a deterministic root that differs from the empty genesis', async () => {
    // Values must exceed the padding leaves that fill the initial prefill region and be strictly increasing.
    const nullifiers = [new Fr(1000n), new Fr(2000n), new Fr(3000n)];
    const genesisWith: GenesisData = { prefilledPublicData: [], genesisTimestamp: 0n, prefilledNullifiers: nullifiers };
    const genesisEmpty: GenesisData = { prefilledPublicData: [], genesisTimestamp: 0n, prefilledNullifiers: [] };
    const wsWith1 = await NativeWorldStateService.ephemeral(genesisWith);
    const wsWith2 = await NativeWorldStateService.ephemeral(genesisWith);
    const wsEmpty = await NativeWorldStateService.ephemeral(genesisEmpty);
    try {
      const rootWith1 = await archiveRoot(wsWith1);
      const rootWith2 = await archiveRoot(wsWith2);
      const rootEmpty = await archiveRoot(wsEmpty);
      expect(rootWith1).toEqual(rootWith2);
      expect(rootWith1).not.toEqual(rootEmpty);
    } finally {
      await wsWith1.close();
      await wsWith2.close();
      await wsEmpty.close();
    }
  });

  // (c) getGenesisValues sorts an unsorted list ascending and produces a genesis whose root matches direct construction.
  it('getGenesisValues sorts prefilled nullifiers and seeds them into the genesis', async () => {
    const unsorted = [new Fr(3000n), new Fr(1000n), new Fr(2000n)];
    const { genesis, genesisArchiveRoot } = await getGenesisValues([], undefined, [], 0n, unsorted);
    expect(genesis.prefilledNullifiers).toEqual([new Fr(1000n), new Fr(2000n), new Fr(3000n)]);
    const ws = await NativeWorldStateService.ephemeral(genesis);
    try {
      expect(await archiveRoot(ws)).toEqual(genesisArchiveRoot);
    } finally {
      await ws.close();
    }
  });

  // (d) The defensive TS-side check rejects prefilled nullifiers that are not unique and strictly increasing before
  // handing them to the native tree.
  it('rejects prefilled nullifiers that are not strictly increasing', async () => {
    const descending: GenesisData = {
      prefilledPublicData: [],
      genesisTimestamp: 0n,
      prefilledNullifiers: [new Fr(3000n), new Fr(1000n)],
    };
    await expect(NativeWorldStateService.ephemeral(descending)).rejects.toThrow(
      'Prefilled genesis nullifiers must be unique and strictly increasing',
    );

    const duplicate: GenesisData = {
      prefilledPublicData: [],
      genesisTimestamp: 0n,
      prefilledNullifiers: [new Fr(1000n), new Fr(1000n)],
    };
    await expect(NativeWorldStateService.ephemeral(duplicate)).rejects.toThrow(
      'Prefilled genesis nullifiers must be unique and strictly increasing',
    );
  });
});
>>>>>>> origin/v5-next
