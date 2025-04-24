import { fromEntries, getEntries, pick } from '@aztec/foundation/collection';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { isoDate } from '@aztec/foundation/string';
import type { FileStore } from '@aztec/stdlib/file-store';

import { getBasePath, getSnapshotIndex, getSnapshotIndexPath } from './download.js';
import type { SnapshotDataKeys, SnapshotMetadata, SnapshotsIndex, UploadSnapshotMetadata } from './types.js';

export async function uploadSnapshotData(
  localPaths: Record<SnapshotDataKeys, string>,
  schemaVersions: SnapshotMetadata['schemaVersions'],
  metadata: UploadSnapshotMetadata,
  store: FileStore,
  opts: { pathFor?: (key: SnapshotDataKeys) => string; private?: boolean } = {},
): Promise<SnapshotMetadata> {
  const timestamp = Date.now();
  const date = isoDate();
  const basePath = getBasePath(metadata);
  const targetPathFor =
    opts.pathFor ?? ((key: SnapshotDataKeys) => `${basePath}/${key}-${date}-${metadata.l2BlockHash}.db`);

  const dataUrls = fromEntries(
    await Promise.all(
      getEntries(localPaths).map(
        async ([key, path]) =>
          [key, await store.upload(targetPathFor(key), path, { compress: true, public: !opts.private })] as const,
      ),
    ),
  );

  return {
    ...pick(metadata, 'l1BlockNumber', 'l2BlockHash', 'l2BlockNumber'),
    schemaVersions,
    timestamp,
    dataUrls,
  };
}

export async function uploadSnapshotToIndex(
  localPaths: Record<SnapshotDataKeys, string>,
  schemaVersions: SnapshotMetadata['schemaVersions'],
  metadata: UploadSnapshotMetadata,
  store: FileStore,
): Promise<SnapshotMetadata> {
  const newSnapshotMetadata = await uploadSnapshotData(localPaths, schemaVersions, metadata, store);
  const snapshotsIndex = (await getSnapshotIndex(metadata, store)) ?? createEmptyIndex(metadata);
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
