import type { EthAddress } from '@aztec/foundation/eth-address';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

export type SnapshotMetadata = {
  l2BlockNumber: number;
  l2BlockHash: string;
  l1BlockNumber: number;
  timestamp: number;
  archiverDataUrl: string;
  worldStateDataUrl: string;
};

export type SnapshotsIndexMetadata = {
  l1ChainId: number;
  l2Version: number;
  rollupAddress: EthAddress;
};

export type SnapshotsIndex = SnapshotsIndexMetadata & {
  snapshots: SnapshotMetadata[];
};

export const SnapshotsIndexSchema = z.object({
  l1ChainId: z.number(),
  l2Version: z.number(),
  rollupAddress: schemas.EthAddress,
  snapshots: z.array(
    z.object({
      l2BlockNumber: z.number(),
      l2BlockHash: z.string(),
      l1BlockNumber: z.number(),
      timestamp: z.number(),
      archiverDataUrl: z.string(),
      worldStateDataUrl: z.string(),
    }),
  ),
}) satisfies ZodFor<SnapshotsIndex>;
