import { Fr } from '@aztec/foundation/fields';
import type { MerkleTreeReadOperations } from '@aztec/stdlib/interfaces/server';
import { MerkleTreeId } from '@aztec/stdlib/trees';

import { type MockProxy, mock } from 'jest-mock-extended';

import { ArchiveCache } from './archive_cache.js';

describe('ArchiveCache', () => {
  let archiveCache: ArchiveCache;
  let db: MockProxy<MerkleTreeReadOperations>;
  let archives: Fr[];

  beforeEach(() => {
    db = mock<MerkleTreeReadOperations>();
    archiveCache = new ArchiveCache(db);
    archives = [Fr.random(), Fr.random(), Fr.random()];
  });

  it('checks archive existence against db', async () => {
    db.findLeafIndices.mockResolvedValue([1n, 2n, undefined]);
    await expect(archiveCache.getArchiveIndices(archives)).resolves.toEqual([1n, 2n, undefined]);
  });

  it('checks archive existence against db only on cache miss', async () => {
    db.findLeafIndices.mockResolvedValueOnce([1n, 2n, undefined]);
    let result = await archiveCache.getArchiveIndices(archives);
    expect(db.findLeafIndices).toHaveBeenCalledWith(MerkleTreeId.ARCHIVE, archives);
    expect(result).toEqual([1n, 2n, undefined]);
    db.findLeafIndices.mockReset();

    // asking again should only request one archive from the db
    db.findLeafIndices.mockResolvedValueOnce([5n]);
    result = await archiveCache.getArchiveIndices(archives);
    // should only request the archive that was not found last time
    expect(db.findLeafIndices).toHaveBeenCalledWith(MerkleTreeId.ARCHIVE, [archives[2]]);
    expect(result).toEqual([1n, 2n, 5n]);
  });
});
