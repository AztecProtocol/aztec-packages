import { fromEntries, getEntries } from '@aztec/foundation/collection';
import { jsonParseWithSchemaSync } from '@aztec/foundation/json-rpc';
import type { FileStore } from '@aztec/stdlib/file-store';

import { join } from 'path';

import {
  SnapshotDataKeys,
  type SnapshotDataUrls,
  type SnapshotMetadata,
  type SnapshotsIndex,
  type SnapshotsIndexMetadata,
  SnapshotsIndexSchema,
} from './types.js';

export async function getSnapshotIndex(
  metadata: SnapshotsIndexMetadata,
  store: FileStore,
): Promise<SnapshotsIndex | undefined> {
  const basePath = getBasePath(metadata);
  const snapshotIndexPath = `${basePath}/index.json`;
  try {
    if (await store.exists(snapshotIndexPath)) {
      const snapshotIndexData = await store.read(snapshotIndexPath);
      return jsonParseWithSchemaSync(snapshotIndexData.toString(), SnapshotsIndexSchema);
    } else {
      return undefined;
    }
  } catch (err) {
    throw new Error(`Error reading snapshot index from ${snapshotIndexPath}: ${err}`);
  }
}

export async function getLatestSnapshotMetadata(
  metadata: SnapshotsIndexMetadata,
  store: FileStore,
): Promise<SnapshotMetadata | undefined> {
  const snapshotsIndex = await getSnapshotIndex(metadata, store);
  return snapshotsIndex?.snapshots.sort((a, b) => b.l1BlockNumber - a.l1BlockNumber)[0];
}

export function getBasePath(metadata: SnapshotsIndexMetadata): string {
  return `aztec-${metadata.l1ChainId}-${metadata.l2Version}-${metadata.rollupAddress}`;
}

export function getSnapshotIndexPath(metadata: SnapshotsIndexMetadata): string {
  return `${getBasePath(metadata)}/index.json`;
}

export function makeSnapshotLocalPaths(baseDir: string): SnapshotDataUrls {
  return fromEntries(SnapshotDataKeys.map(key => [key, join(baseDir, `${key}.db`)]));
}

export async function downloadSnapshot(
  snapshot: Pick<SnapshotMetadata, 'dataUrls'>,
  localPaths: Record<SnapshotDataKeys, string>,
  store: FileStore,
): Promise<void> {
  await Promise.all(getEntries(localPaths).map(([key, path]) => store.download(snapshot.dataUrls[key], path)));
}
