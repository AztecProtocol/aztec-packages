import { times } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { FileStore } from '@aztec/stdlib/file-store';

import { type MockProxy, mock } from 'jest-mock-extended';

import { getLatestSnapshotMetadata } from './download.js';
import type { SnapshotMetadata, SnapshotsIndex, SnapshotsIndexMetadata } from './types.js';
import { uploadSnapshot } from './upload.js';

describe('snapshots', () => {
  let store: MockProxy<FileStore>;
  let index: SnapshotsIndex;
  let metadata: SnapshotsIndexMetadata;
  let snapshots: SnapshotMetadata[];
  let rollup: EthAddress;

  const makeSnapshotMetadata = (index: number): SnapshotMetadata => ({
    archiverDataUrl: `/archiver/${index}`,
    worldStateDataUrl: `/ws/${index}`,
    l1BlockNumber: index,
    l2BlockNumber: index,
    l2BlockHash: `0x${index}`,
    timestamp: index,
  });

  beforeEach(() => {
    store = mock<FileStore>();
    rollup = EthAddress.random();
    metadata = { l1ChainId: 1, l2Version: 2, rollupAddress: rollup };
    snapshots = times(5, makeSnapshotMetadata);
    index = { ...metadata, snapshots };
  });

  describe('download', () => {
    it('gets latest snapshot metadata', async () => {
      store.exists.mockResolvedValue(true);
      store.read.mockResolvedValue(Buffer.from(jsonStringify(index), 'utf-8'));
      await expect(getLatestSnapshotMetadata(metadata, store)).resolves.toEqual(snapshots[4]);
      expect(store.read).toHaveBeenCalledWith(`aztec-1-2-${rollup.toString()}/index.json`);
    });

    it('returns undefined if there are no snapshots', async () => {
      store.exists.mockResolvedValue(false);
      await expect(getLatestSnapshotMetadata(metadata, store)).resolves.toBeUndefined();
    });
  });

  describe('upload', () => {
    it('with no existing index', async () => {
      store.exists.mockResolvedValue(false);
      store.upload.mockResolvedValueOnce('/archiver/1').mockResolvedValueOnce('/ws/1');

      let uploadedIndex: string;
      store.save.mockImplementation((_path, data) => {
        uploadedIndex = data.toString();
        return Promise.resolve('index.json');
      });

      const uploaded = await uploadSnapshot(
        'archiver-1',
        'ws-1',
        { ...metadata, l1BlockNumber: 1, l2BlockHash: '0x1', l2BlockNumber: 1 },
        store,
      );

      const expectedSnapshot: SnapshotMetadata = {
        ...makeSnapshotMetadata(1),
        timestamp: expect.any(Number),
      };

      expect(uploaded).toEqual(expectedSnapshot);

      expect(JSON.parse(uploadedIndex!)).toEqual({
        ...metadata,
        rollupAddress: rollup.toString(),
        snapshots: [expectedSnapshot],
      });

      expect(store.exists).toHaveBeenCalledWith(`aztec-1-2-${rollup.toString()}/index.json`);
      expect(store.upload).toHaveBeenCalledTimes(2);
    });

    it('updates an existing index', async () => {
      store.exists.mockResolvedValue(true);
      store.read.mockResolvedValue(Buffer.from(jsonStringify(index), 'utf-8'));
      store.upload.mockResolvedValueOnce('/archiver/6').mockResolvedValueOnce('/ws/6');

      let uploadedIndex: string;
      store.save.mockImplementation((_path, data) => {
        uploadedIndex = data.toString();
        return Promise.resolve('index.json');
      });

      const uploaded = await uploadSnapshot(
        'archiver-6',
        'ws-6',
        { ...metadata, l1BlockNumber: 6, l2BlockHash: '0x6', l2BlockNumber: 6 },
        store,
      );

      const expectedSnapshot: SnapshotMetadata = {
        ...makeSnapshotMetadata(6),
        timestamp: expect.any(Number),
      };

      expect(uploaded).toEqual(expectedSnapshot);

      expect(JSON.parse(uploadedIndex!)).toEqual({
        ...metadata,
        rollupAddress: rollup.toString(),
        snapshots: [expectedSnapshot, ...snapshots],
      });

      expect(store.exists).toHaveBeenCalledWith(`aztec-1-2-${rollup.toString()}/index.json`);
      expect(store.upload).toHaveBeenCalledTimes(2);
    });
  });
});
