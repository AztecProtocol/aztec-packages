import { type ArchiverConfig, getArchiverConfigFromEnv as getArchiverVars } from '@aztec/archiver';
import { type P2PConfig, getP2PConfigEnvVars } from '@aztec/p2p';
import { type ProverClientConfig, getProverEnvVars } from '@aztec/prover-client';
import { type SequencerClientConfig, getConfigEnvVars as getSequencerVars } from '@aztec/sequencer-client';
import { type WorldStateConfig, getWorldStateConfigFromEnv as getWorldStateVars } from '@aztec/world-state';
import { type ValidatorClientConfig, getValidatorConfigFromEnv as getValidatorEnvVars } from '@aztec/validator-client';

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

/**
 * The configuration the aztec node.
 */
export type AztecNodeConfig = ArchiverConfig &
  SequencerClientConfig &
  ValidatorClientConfig &
  ProverClientConfig &
  WorldStateConfig &
  P2PConfig & {
    /** Whether the sequencer is disabled for this node. */
    disableSequencer: boolean;

    /** Whether the prover is disabled for this node. */
    disableProver: boolean;
  
    // TODO(md): needed?
    /** Whether the validator is disabled for this node */
    disableValidator: boolean
  };

/**
 * Returns the config of the aztec node from environment variables with reasonable defaults.
 * @returns A valid aztec node config.
 */
export function getConfigEnvVars(): AztecNodeConfig {
  const { SEQ_DISABLED, VALIDATOR_DISABLED, PROVER_DISABLED = '' } = process.env;

  const allEnvVars: AztecNodeConfig = {
    ...getSequencerVars(),
    ...getArchiverVars(),
    ...getP2PConfigEnvVars(),
    ...getWorldStateVars(),
    ...getProverEnvVars(),
    ...getValidatorEnvVars(),
    disableSequencer: !!SEQ_DISABLED,
    disableValidator: !!VALIDATOR_DISABLED,
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
