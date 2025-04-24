import type { EthAddress } from '@aztec/foundation/eth-address';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

export const SnapshotDataKeys = [
  'archiver',
  'nullifier-tree',
  'public-data-tree',
  'note-hash-tree',
  'archive-tree',
  'l1-to-l2-message-tree',
] as const;

export type SnapshotDataKeys = (typeof SnapshotDataKeys)[number];

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
