import { times } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { FileStore } from '@aztec/stdlib/file-store';

import { type MockProxy, mock } from 'jest-mock-extended';

import { getLatestSnapshotMetadata } from './download.js';
import type { SnapshotDataUrls, SnapshotMetadata, SnapshotsIndex, SnapshotsIndexMetadata } from './types.js';
import { uploadSnapshotToIndex } from './upload.js';

describe('snapshots', () => {
  let store: MockProxy<FileStore>;
  let index: SnapshotsIndex;
  let metadata: SnapshotsIndexMetadata;
  let snapshots: SnapshotMetadata[];
  let rollup: EthAddress;

  const makeDataPaths = (index: number, basePath = ''): SnapshotDataUrls => ({
    'archive-tree': `${basePath}/archive-tree/${index}`,
    'l1-to-l2-message-tree': `${basePath}/l1-to-l2-message-tree/${index}`,
    'note-hash-tree': `${basePath}/note-hash-tree/${index}`,
    'nullifier-tree': `${basePath}/nullifier-tree/${index}`,
    'public-data-tree': `${basePath}/public-data-tree/${index}`,
    archiver: `${basePath}/archiver/${index}`,
  });

  const makeExpectedDataPaths = () => ({
    'archive-tree': expect.stringContaining('archive'),
    'l1-to-l2-message-tree': expect.stringContaining('l1-to-l2-message'),
    'note-hash-tree': expect.stringContaining('note-hash'),
    'nullifier-tree': expect.stringContaining('nullifier'),
    'public-data-tree': expect.stringContaining('public-data'),
    archiver: expect.stringContaining('archiver'),
  });

  const makeSnapshotMetadata = (index: number): SnapshotMetadata => ({
    dataUrls: makeDataPaths(index),
    l1BlockNumber: index,
    l2BlockNumber: index,
    l2BlockHash: `0x${index}`,
    timestamp: index,
    schemaVersions: { archiver: 1, worldState: 1 },
  });

  beforeEach(() => {
    store = mock<FileStore>();
    store.upload.mockImplementation(dest => Promise.resolve(dest));
    rollup = EthAddress.random();
    metadata = { l1ChainId: 1, rollupVersion: 2, rollupAddress: rollup };
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

      let uploadedIndex: string;
      store.save.mockImplementation((_path, data) => {
        uploadedIndex = data.toString();
        return Promise.resolve('index.json');
      });

      const uploaded = await uploadSnapshotToIndex(
        makeDataPaths(1, '/local/'),
        { archiver: 1, worldState: 1 },
        { ...metadata, l1BlockNumber: 1, l2BlockHash: '0x1', l2BlockNumber: 1 },
        store,
      );

      const expectedSnapshot: SnapshotMetadata = {
        ...makeSnapshotMetadata(1),
        dataUrls: makeExpectedDataPaths(),
        timestamp: expect.any(Number),
      };

      expect(uploaded).toEqual(expectedSnapshot);

      expect(JSON.parse(uploadedIndex!)).toEqual({
        ...metadata,
        rollupAddress: rollup.toString(),
        snapshots: [expectedSnapshot],
      });

      expect(store.exists).toHaveBeenCalledWith(`aztec-1-2-${rollup.toString()}/index.json`);
      expect(store.upload).toHaveBeenCalledTimes(6);
    });

    it('updates an existing index', async () => {
      store.exists.mockResolvedValue(true);
      store.read.mockResolvedValue(Buffer.from(jsonStringify(index), 'utf-8'));

      let uploadedIndex: string;
      store.save.mockImplementation((_path, data) => {
        uploadedIndex = data.toString();
        return Promise.resolve('index.json');
      });

      const uploaded = await uploadSnapshotToIndex(
        makeDataPaths(6, '/local/'),
        { archiver: 1, worldState: 1 },
        { ...metadata, l1BlockNumber: 6, l2BlockHash: '0x6', l2BlockNumber: 6 },
        store,
      );

      const expectedSnapshot: SnapshotMetadata = {
        ...makeSnapshotMetadata(6),
        dataUrls: makeExpectedDataPaths(),
        timestamp: expect.any(Number),
      };

      expect(uploaded).toEqual(expectedSnapshot);

      expect(JSON.parse(uploadedIndex!)).toEqual({
        ...metadata,
        rollupAddress: rollup.toString(),
        snapshots: [expectedSnapshot, ...snapshots],
      });

      expect(store.exists).toHaveBeenCalledWith(`aztec-1-2-${rollup.toString()}/index.json`);
      expect(store.upload).toHaveBeenCalledTimes(6);
    });
  });
});
