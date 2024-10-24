import { type ArchiveSource, type Archiver } from '@aztec/archiver';
import { BBCircuitVerifier, TestCircuitVerifier } from '@aztec/bb-prover';
import {
  type AztecNode,
  type ProverCoordination,
  type WorldStateSynchronizer,
  createAztecNodeClient,
} from '@aztec/circuit-types';
import { createDebugLogger } from '@aztec/foundation/log';
import { type P2PClient, createP2PClient } from '@aztec/p2p';
import { type TelemetryClient } from '@aztec/telemetry-client';

import { type ProverNodeConfig } from '../config.js';

// We return a reference to the P2P client so that the prover node can stop the service when it shuts down.
type ProverCoordinationWithP2P = [ProverCoordination, P2PClient | undefined];
type ProverCoordinationDeps = {
  aztecNodeTxProvider?: AztecNode;
  worldStateSynchronizer?: WorldStateSynchronizer;
  archiver?: Archiver | ArchiveSource;
  telemetry?: TelemetryClient;
};

export async function createProverCoordination(
  config: ProverNodeConfig,
  deps: ProverCoordinationDeps,
): Promise<ProverCoordinationWithP2P> {
  const log = createDebugLogger('aztec:createProverCoordination');

  if (deps.aztecNodeTxProvider) {
    log.info('Using prover coordination via aztec node');
    return [deps.aztecNodeTxProvider, undefined];
  }

  if (config.p2pEnabled) {
    log.info('Using prover coordination via p2p');

    if (!deps.archiver || !deps.worldStateSynchronizer || !deps.telemetry) {
      throw new Error('Missing dependencies for p2p prover coordination');
    }

    const proofVerifier = config.realProofs ? await BBCircuitVerifier.new(config) : new TestCircuitVerifier();
    const p2pClient = await createP2PClient(
      config,
      deps.archiver,
      proofVerifier,
      deps.worldStateSynchronizer,
      deps.telemetry,
    );
    await p2pClient.start();

    return [p2pClient, p2pClient];
  }

  if (config.proverCoordinationNodeUrl) {
    log.info('Using prover coordination via node url');
    return [createAztecNodeClient(config.proverCoordinationNodeUrl), undefined];
  } else {
    throw new Error(`Aztec Node URL for Tx Provider is not set.`);
  }
}
