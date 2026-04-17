import { schemas } from '@aztec/foundation/schemas';
import { AztecNodeAdminApiSchema } from '@aztec/stdlib/interfaces/client';
import { AztecNodeApiSchema, P2PApiSchema } from '@aztec/stdlib/interfaces/server';
import { TopicType } from '@aztec/stdlib/p2p';

import { z } from 'zod';

/**
 * Extended schema for WorkerAztecNode RPC.
 * Includes all standard AztecNode methods plus flat RPC methods for
 * P2P, sequencer, and admin operations that tests access via getP2P()/getSequencer().
 */
export const WorkerAztecNodeSchema = {
  ...AztecNodeApiSchema,

  // P2P methods — flattened from getP2P().method()
  getPeers: P2PApiSchema.getPeers,
  getGossipMeshPeerCount: z.function().args(z.nativeEnum(TopicType)).returns(z.number()),

  // Sequencer methods — flattened from getSequencer().method()
  getValidatorAddresses: z.function().args().returns(z.array(schemas.EthAddress).optional()),
  startSequencer: z.function().args().returns(z.void()),

  // Admin methods — all AztecNodeAdmin methods delegated to AztecNodeService
  setConfig: AztecNodeAdminApiSchema.setConfig,
  getConfig: AztecNodeAdminApiSchema.getConfig,
  getSlashOffenses: AztecNodeAdminApiSchema.getSlashOffenses,
  startSnapshotUpload: AztecNodeAdminApiSchema.startSnapshotUpload,
  rollbackTo: AztecNodeAdminApiSchema.rollbackTo,
  pauseSync: AztecNodeAdminApiSchema.pauseSync,
  resumeSync: AztecNodeAdminApiSchema.resumeSync,
  reloadKeystore: AztecNodeAdminApiSchema.reloadKeystore,

  // Test-only: drops a fraction of txs entering the pending pool (gossip + direct sendTx paths).
  // Req/resp-fetched txs go through addProtectedTxs/addMinedTxs which bypass the drop.
  // Used by reqresp tests to force non-proposer nodes to fetch tx data via req/resp.
  setTxPoolDropProbability: z.function().args(z.number()).returns(z.void()),

  // Test-only: installs a GossipSourceObserver on the worker's P2PService so the
  // test can assert on sources of received gossip (txs, block proposals, checkpoint
  // attestations). Used by preferred_gossip_network to verify that picky validators
  // only see gossip from preferred nodes, and preferred nodes only see it from validators.
  startGossipSourceRecording: z.function().args().returns(z.void()),
  getGossipSources: z
    .function()
    .args()
    .returns(
      z.array(
        z.object({
          topic: z.enum(['tx', 'proposal', 'attestation']),
          source: z.string(),
          msgId: z.string(),
          timestampMs: z.number(),
        }),
      ),
    ),

  // DateProvider sync — parent broadcasts time updates to all workers
  setTime: z.function().args(z.number()).returns(z.void()),

  // Lifecycle
  stopNode: z.function().args().returns(z.void()),

  // ELU monitor — retrieve per-worker summary stats for aggregate reporting
  getEluStats: z
    .function()
    .args()
    .returns(
      z
        .object({
          label: z.string(),
          meanElu: z.number(),
          maxElu: z.number(),
          p90Elu: z.number(),
          durationS: z.number(),
          meanCpuU: z.number(),
          maxCpuU: z.number(),
          peakRss: z.number(),
          peakHeap: z.number(),
        })
        .optional(),
    ),
};
