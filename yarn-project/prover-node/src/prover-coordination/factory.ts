import type { ArchiveSource, Archiver } from '@aztec/archiver';
import { BBCircuitVerifier, TestCircuitVerifier } from '@aztec/bb-prover';
import type { EpochCache } from '@aztec/epoch-cache';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { createP2PClient } from '@aztec/p2p';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { type AztecNode, createAztecNodeClient } from '@aztec/stdlib/interfaces/client';
import type { ProverCoordination, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { P2PClientType } from '@aztec/stdlib/p2p';
import { getPackageVersion } from '@aztec/stdlib/update-checker';
import { getComponentsVersionsFromConfig } from '@aztec/stdlib/versioning';
import { type TelemetryClient, makeTracedFetch } from '@aztec/telemetry-client';

import type { ProverNodeConfig } from '../config.js';
import {
  type CombinedCoordinationOptions,
  CombinedProverCoordination,
  type TxSource,
} from './combined-prover-coordination.js';

// We return a reference to the P2P client so that the prover node can stop the service when it shuts down.
type ProverCoordinationDeps = {
  aztecNodeTxProvider?: TxSource;
  worldStateSynchronizer: WorldStateSynchronizer;
  archiver: Archiver | ArchiveSource;
  telemetry?: TelemetryClient;
  epochCache: EpochCache;
};

/**
 * Creates a prover coordination service.
 * If p2p is enabled, prover coordination is done via p2p.
 * If an Aztec node URL is provided, prover coordination is done via the Aztec node over http.
 * If an aztec node is provided, it is returned directly.
 */
export async function createProverCoordination(
  config: ProverNodeConfig & DataStoreConfig,
  deps: ProverCoordinationDeps,
): Promise<ProverCoordination> {
  const log = createLogger('prover-node:prover-coordination');

  const coordinationConfig: CombinedCoordinationOptions = {
    txGatheringBatchSize: config.txGatheringBatchSize ?? 10,
    txGatheringMaxParallelRequestsPerNode: config.txGatheringMaxParallelRequestsPerNode ?? 10,
  };

  if (deps.aztecNodeTxProvider) {
    log.info('Using prover coordination via aztec node');
    return new CombinedProverCoordination(undefined, [deps.aztecNodeTxProvider!], coordinationConfig);
  }

  if (config.p2pEnabled) {
    log.info('Using prover coordination via p2p');

    if (!deps.archiver || !deps.worldStateSynchronizer || !deps.telemetry || !deps.epochCache) {
      throw new Error('Missing dependencies for p2p prover coordination');
    }
  }

  let nodes: AztecNode[] = [];
  if (config.proverCoordinationNodeUrls && config.proverCoordinationNodeUrls.length > 0) {
    log.info('Using prover coordination via node urls');
    const versions = getComponentsVersionsFromConfig(config, protocolContractTreeRoot, getVKTreeRoot());
    nodes = config.proverCoordinationNodeUrls.map(url => {
      log.info(`Creating aztec node client for prover coordination with url: ${url}`);
      return createAztecNodeClient(url, versions, makeTracedFetch([1, 2, 3], false));
    });
  }

  const proofVerifier = config.realProofs ? await BBCircuitVerifier.new(config) : new TestCircuitVerifier();
  const p2pClient = await createP2PClient(
    P2PClientType.Prover,
    config,
    deps.archiver,
    proofVerifier,
    deps.worldStateSynchronizer,
    deps.epochCache,
    getPackageVersion() ?? '',
    new DateProvider(),
    deps.telemetry,
  );
  await p2pClient.start();

  return new CombinedProverCoordination(p2pClient, nodes, coordinationConfig);
}
