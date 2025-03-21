import { pick } from '@aztec/foundation/collection';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { FileStore } from '@aztec/stdlib/file-store';

import { getBasePath, getSnapshotIndex, getSnapshotIndexPath } from './download.js';
import type { SnapshotMetadata, SnapshotsIndex } from './types.js';

export async function uploadSnapshot(
  archiverPath: string,
  worldStatePath: string,
  metadata: Pick<SnapshotMetadata, 'l2BlockNumber' | 'l2BlockHash' | 'l1BlockNumber'> &
    Pick<SnapshotsIndex, 'l1ChainId' | 'l2Version' | 'rollupAddress'>,
  store: FileStore,
): Promise<SnapshotMetadata> {
  const timestamp = Date.now();
  const date = new Date()
    .toISOString()
    .replace(/[\-:T]/g, '')
    .replace(/\..+$/, '');

  const basePath = getBasePath(metadata);
  const [archiverDataUrl, worldStateDataUrl] = await Promise.all([
    store.upload(`${basePath}/archiver-${date}-${metadata.l2BlockHash}.db`, archiverPath, { compress: true }),
    store.upload(`${basePath}/worldstate-${date}-${metadata.l2BlockHash}.db`, worldStatePath, { compress: true }),
  ]);

  const snapshotsIndex = (await getSnapshotIndex(metadata, store)) ?? createEmptyIndex(metadata);

  const newSnapshotMetadata: SnapshotMetadata = {
    ...pick(metadata, 'l1BlockNumber', 'l2BlockHash', 'l2BlockNumber'),
    timestamp,
    archiverDataUrl,
    worldStateDataUrl,
  };
  snapshotsIndex.snapshots.unshift(newSnapshotMetadata);

  await store.save(getSnapshotIndexPath(metadata), Buffer.from(jsonStringify(snapshotsIndex, true)));
  return newSnapshotMetadata;
}

function createEmptyIndex(metadata: Pick<SnapshotsIndex, 'l1ChainId' | 'l2Version' | 'rollupAddress'>): SnapshotsIndex {
  return {
    ...pick(metadata, 'l1ChainId', 'l2Version', 'rollupAddress'),
    snapshots: [],
  };
}
