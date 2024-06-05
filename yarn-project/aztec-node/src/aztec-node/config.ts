import { type ArchiverConfig, getConfigEnvVars as getArchiverVars } from '@aztec/archiver';
import { type P2PConfig, getP2PConfigEnvVars } from '@aztec/p2p';
import { type ProverClientConfig, getProverEnvVars } from '@aztec/prover-client';
import { type SequencerClientConfig, getConfigEnvVars as getSequencerVars } from '@aztec/sequencer-client';
import { getConfigEnvVars as getWorldStateVars } from '@aztec/world-state';

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

/**
 * The configuration the aztec node.
 */
export type AztecNodeConfig = ArchiverConfig &
  SequencerClientConfig &
  ProverClientConfig &
  P2PConfig & {
    /** Whether the sequencer is disabled for this node. */
    disableSequencer: boolean;

    /** Whether the prover is disabled for this node. */
    disableProver: boolean;

    /** A URL for an archiver service that the node will use. */
    archiverUrl?: string;
  };

/**
 * Returns the config of the aztec node from environment variables with reasonable defaults.
 * @returns A valid aztec node config.
 */
export function getConfigEnvVars(): AztecNodeConfig {
  const { SEQ_DISABLED, PROVER_DISABLED = '', ARCHIVER_URL } = process.env;

  const allEnvVars: AztecNodeConfig = {
    ...getSequencerVars(),
    ...getArchiverVars(),
    ...getP2PConfigEnvVars(),
    ...getWorldStateVars(),
    ...getProverEnvVars(),
    disableSequencer: !!SEQ_DISABLED,
    archiverUrl: ARCHIVER_URL,
    disableProver: ['1', 'true'].includes(PROVER_DISABLED),
  };

  return allEnvVars;
}

/**
 * Returns package name and version.
 */
export function getPackageInfo() {
  const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json');
  const { version, name } = JSON.parse(readFileSync(packageJsonPath).toString());
  return { version, name };
}
