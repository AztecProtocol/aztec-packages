import type { ConfigMappingsType } from '@aztec/foundation/config';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

export type BaseSnapshotConfig = {
  /** Sync mode: full to always sync via L1, snapshot to download a snapshot if there is no local data, force-snapshot to download even if there is local data. */
  syncMode: 'full' | 'snapshot' | 'force-snapshot';
  /** Base URL for snapshots index. Index file will be searched at `SNAPSHOTS_BASE_URL/aztec-L1_CHAIN_ID-VERSION-ROLLUP_ADDRESS/index.json` */
  snapshotsUrl?: string;
};

export const baseSnapshotConfigMappings: ConfigMappingsType<BaseSnapshotConfig> = {
  syncMode: {
    env: 'SYNC_MODE',
    description:
      'Set sync mode to `full` to always sync via L1, `snapshot` to download a snapshot if there is no local data, `force-snapshot` to download even if there is local data.',
    defaultValue: 'snapshot',
  },
  snapshotsUrl: {
    env: 'SYNC_SNAPSHOTS_URL',
    description: 'Base URL for snapshots index.',
  },
};

export const SnapshotDataKeys = [
  'archiver',
  'nullifier-tree',
  'public-data-tree',
  'note-hash-tree',
  'archive-tree',
  'l1-to-l2-message-tree',
] as const;

export type SnapshotDataKeys = (typeof SnapshotDataKeys)[number];

export const SnapshotComponents = ['archiver', 'worldState'] as const;

export const snapshotComponentMap: Record<(typeof SnapshotComponents)[number], SnapshotDataKeys[]> = {
  archiver: ['archiver'],
  worldState: ['nullifier-tree', 'public-data-tree', 'note-hash-tree', 'archive-tree', 'l1-to-l2-message-tree'],
};
export type SnapshotDataUrls = Record<SnapshotDataKeys, string>;

export type SnapshotMetadata = {
  l2BlockNumber: number;
  l2BlockHash: string;
  l1BlockNumber: number;
  timestamp: number;
  dataUrls: SnapshotDataUrls;
  schemaVersions: { archiver: number; worldState: number };
};

export type SnapshotsIndexMetadata = {
  l1ChainId: number;
  rollupVersion: number;
  rollupAddress: EthAddress;
};

export type SnapshotsIndex = SnapshotsIndexMetadata & {
  snapshots: SnapshotMetadata[];
};

export type UploadSnapshotMetadata = Pick<SnapshotMetadata, 'l2BlockNumber' | 'l2BlockHash' | 'l1BlockNumber'> &
  Pick<SnapshotsIndex, 'l1ChainId' | 'rollupVersion' | 'rollupAddress'>;

export const SnapshotsIndexSchema = z.object({
  l1ChainId: z.number(),
  rollupVersion: z.number(),
  rollupAddress: schemas.EthAddress,
  snapshots: z.array(
    z.object({
      l2BlockNumber: z.number(),
      l2BlockHash: z.string(),
      l1BlockNumber: z.number(),
      timestamp: z.number(),
      schemaVersions: z.object({
        archiver: z.number(),
        worldState: z.number(),
      }),
      dataUrls: z
        .record(z.enum(SnapshotDataKeys), z.string())
        // See https://stackoverflow.com/questions/77958464/zod-record-with-required-keys
        .refine((obj): obj is Required<typeof obj> => SnapshotDataKeys.every(key => !!obj[key])),
    }),
  ),
}) satisfies ZodFor<SnapshotsIndex>;

export const UploadSnapshotMetadataSchema = z.object({
  l2BlockNumber: z.number(),
  l2BlockHash: z.string(),
  l1BlockNumber: z.number(),
  l1ChainId: z.number(),
  rollupVersion: z.number(),
  rollupAddress: schemas.EthAddress,
}) satisfies ZodFor<UploadSnapshotMetadata>;
