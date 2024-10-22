import { type ArchiveSource, type Archiver } from '@aztec/archiver';
import { BBCircuitVerifier, TestCircuitVerifier } from '@aztec/bb-prover';
import { type ProverCoordination, type WorldStateSynchronizer, createAztecNodeClient } from '@aztec/circuit-types';
import { createDebugLogger } from '@aztec/foundation/log';
import { createP2PClient } from '@aztec/p2p';
import { type TelemetryClient } from '@aztec/telemetry-client';

import { type ProverNodeConfig } from '../config.js';

export async function createProverCoordination(
  config: ProverNodeConfig,
  worldStateSynchronizer: WorldStateSynchronizer,
  archiver: Archiver | ArchiveSource,
  telemetry: TelemetryClient,
): Promise<ProverCoordination> {
  const log = createDebugLogger('aztec:createProverCoordination');

  if (config.p2pEnabled) {
    log.info('Using prover coordination via p2p');

    const proofVerifier = config.realProofs ? await BBCircuitVerifier.new(config) : new TestCircuitVerifier();
    const p2pClient = await createP2PClient(config, archiver, proofVerifier, worldStateSynchronizer, telemetry);
    await p2pClient.start();

    return p2pClient;
  } else if (config.proverCoordinationNodeUrl) {
    log.info('Using prover coordination via node url');
    return createAztecNodeClient(config.proverCoordinationNodeUrl);
  } else {
    throw new Error(`Aztec Node URL for Tx Provider is not set.`);
  }
}
