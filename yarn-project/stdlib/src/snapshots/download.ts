import { fromEntries, getEntries, maxBy } from '@aztec/foundation/collection';
import { jsonParseWithSchema } from '@aztec/foundation/json-rpc';
import type { ReadOnlyFileStore } from '@aztec/stdlib/file-store';

import { createReadStream, createWriteStream } from 'fs';
import fs from 'fs/promises';
import pathMod from 'path';
import { pipeline } from 'stream/promises';
import { createGunzip, gunzipSync } from 'zlib';

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
  store: ReadOnlyFileStore,
): Promise<SnapshotsIndex | undefined> {
  const basePath = getBasePath(metadata);
  const snapshotIndexPath = `${basePath}/index.json`;
  try {
    if (await store.exists(snapshotIndexPath)) {
      const snapshotIndexData = await store.read(snapshotIndexPath);
      const buf = maybeGunzip(snapshotIndexData);
      return jsonParseWithSchema(buf.toString('utf-8'), SnapshotsIndexSchema);
    } else {
      return undefined;
    }
  } catch (err) {
    throw new Error(`Error reading snapshot index from ${snapshotIndexPath}: ${err}`);
  }
}

export async function getLatestSnapshotMetadata(
  metadata: SnapshotsIndexMetadata,
  store: ReadOnlyFileStore,
): Promise<SnapshotMetadata | undefined> {
  const snapshotsIndex = await getSnapshotIndex(metadata, store);
  return snapshotsIndex?.snapshots && maxBy(snapshotsIndex?.snapshots, s => s.l1BlockNumber);
}

export function getBasePath(metadata: SnapshotsIndexMetadata): string {
  return `aztec-${metadata.l1ChainId}-${metadata.rollupVersion}-${metadata.rollupAddress}`;
}

export function getSnapshotIndexPath(metadata: SnapshotsIndexMetadata): string {
  return `${getBasePath(metadata)}/index.json`;
}

export function makeSnapshotPaths(baseDir: string): SnapshotDataUrls {
  // We do not use path.join since that screws up protocol prefixes
  return fromEntries(SnapshotDataKeys.map(key => [key, `${baseDir}/${key}.db`]));
}

function isGzipMagic(data: Buffer): boolean {
  return data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
}

function maybeGunzip(data: Buffer): Buffer {
  const magicNumberIndicatesGzip = isGzipMagic(data);

  if (magicNumberIndicatesGzip) {
    try {
      const out = gunzipSync(data);
      return out;
    } catch (err) {
      throw new Error(`Decompression of gzipped data failed: ${(err as Error).message}`);
    }
  }
  return data;
}

async function detectGzip(localFilePathToPeek: string): Promise<boolean> {
  // Peek the actual bytes we downloaded.
  try {
    const fd = await fs.open(localFilePathToPeek, 'r');
    try {
      const header = Buffer.alloc(2);
      const { bytesRead } = await fd.read(header, 0, 2, 0);
      return bytesRead >= 2 && isGzipMagic(header);
    } finally {
      await fd.close();
    }
  } catch {
    return false;
  }
}

export async function downloadSnapshot(
  snapshot: Pick<SnapshotMetadata, 'dataUrls'>,
  localPaths: Record<SnapshotDataKeys, string>,
  store: ReadOnlyFileStore,
): Promise<void> {
  await Promise.all(
    getEntries(localPaths).map(async ([key, path]) => {
      await fs.mkdir(pathMod.dirname(path), { recursive: true });

      const tmpPath = `${path}.download`;
      try {
        const url = snapshot.dataUrls[key];
        await store.download(url, tmpPath);

        const isGzip = await detectGzip(tmpPath);

        const read = createReadStream(tmpPath);
        const write = createWriteStream(path);
        if (isGzip) {
          const gunzip = createGunzip();
          await pipeline(read, gunzip, write);
        } else {
          await pipeline(read, write);
        }
      } finally {
        await fs.unlink(tmpPath).catch(() => undefined);
      }
    }),
  );
}
