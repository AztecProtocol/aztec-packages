import { fromEntries, getEntries, pick } from '@aztec/foundation/collection';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { FileStore } from '@aztec/stdlib/file-store';

import { getBasePath, getSnapshotIndex, getSnapshotIndexPath } from './download.js';
import type { SnapshotDataKeys, SnapshotMetadata, SnapshotsIndex } from './types.js';

export type UploadSnapshotMetadata = Pick<SnapshotMetadata, 'l2BlockNumber' | 'l2BlockHash' | 'l1BlockNumber'> &
  Pick<SnapshotsIndex, 'l1ChainId' | 'rollupVersion' | 'rollupAddress'>;

export async function uploadSnapshot(
  localPaths: Record<SnapshotDataKeys, string>,
  schemaVersions: SnapshotMetadata['schemaVersions'],
  metadata: UploadSnapshotMetadata,
  store: FileStore,
): Promise<SnapshotMetadata> {
  const timestamp = Date.now();
  const date = new Date().toISOString().replace(/[-:T]/g, '').replace(/\..+$/, '');
  const basePath = getBasePath(metadata);
  const targetPathFor = (key: SnapshotDataKeys) => `${basePath}/${key}-${date}-${metadata.l2BlockHash}.db`;

  const dataUrls = fromEntries(
    await Promise.all(
      getEntries(localPaths).map(
        async ([key, path]) =>
          [key, await store.upload(targetPathFor(key), path, { compress: true, public: true })] as const,
      ),
    ),
  );

  const snapshotsIndex = (await getSnapshotIndex(metadata, store)) ?? createEmptyIndex(metadata);

  const newSnapshotMetadata: SnapshotMetadata = {
    ...pick(metadata, 'l1BlockNumber', 'l2BlockHash', 'l2BlockNumber'),
    schemaVersions,
    timestamp,
    dataUrls,
  };
  snapshotsIndex.snapshots.unshift(newSnapshotMetadata);

  await store.save(getSnapshotIndexPath(metadata), Buffer.from(jsonStringify(snapshotsIndex, true)), {
    public: true, // Make the index publicly accessible
    metadata: { ['Cache-control']: 'no-store' }, // Do not cache object versions
  });
  return newSnapshotMetadata;
}

function createEmptyIndex(
  metadata: Pick<SnapshotsIndex, 'l1ChainId' | 'rollupVersion' | 'rollupAddress'>,
): SnapshotsIndex {
  return {
    ...pick(metadata, 'l1ChainId', 'rollupVersion', 'rollupAddress'),
    snapshots: [],
  };
}
