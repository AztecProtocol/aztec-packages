import type { Archiver } from '@aztec/archiver';
import type { UploadSnapshotMetadata } from '@aztec/stdlib/snapshots';

import type { UploadSnapshotConfig } from './upload-snapshot.js';

export async function buildSnapshotMetadata(
  archiver: Archiver,
  config: UploadSnapshotConfig,
): Promise<UploadSnapshotMetadata> {
  const [rollupAddress, l1BlockNumber, { latest }] = await Promise.all([
    archiver.getRollupAddress(),
    archiver.getL1BlockNumber(),
    archiver.getL2Tips(),
  ] as const);

  const { number: l2BlockNumber, hash: l2BlockHash } = latest;
  if (!l2BlockHash) {
    throw new Error(`Failed to get L2 block hash from archiver.`);
  }

  return {
    l1ChainId: config.l1ChainId,
    rollupVersion: config.rollupVersion,
    rollupAddress,
    l2BlockNumber,
    l2BlockHash,
    l1BlockNumber: Number(l1BlockNumber),
  };
}
