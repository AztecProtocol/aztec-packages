import { AZTEC_SLOT_DURATION } from '@aztec/circuits.js';
import { NULL_KEY } from '@aztec/ethereum';
import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
} from '@aztec/foundation/config';

/**
 * The Validator Configuration
 */
export interface ValidatorClientConfig {
  /** The private key of the validator participating in attestation duties */
  validatorPrivateKey: string;

  /** Do not run the validator */
  disableValidator: boolean;

  /** Interval between polling for new attestations from peers */
  attestationPollingIntervalMs: number;

  /** Wait for attestations timeout */
  attestationWaitTimeoutMs: number;
}

export const validatorClientConfigMappings: ConfigMappingsType<ValidatorClientConfig> = {
  validatorPrivateKey: {
    env: 'VALIDATOR_PRIVATE_KEY',
    parseEnv: (val: string) => (val ? `0x${val.replace('0x', '')}` : NULL_KEY),
    description: 'The private key of the validator participating in attestation duties',
  },
  disableValidator: {
    env: 'VALIDATOR_DISABLED',
    description: 'Do not run the validator',
    ...booleanConfigHelper(),
  },
  attestationPollingIntervalMs: {
    env: 'VALIDATOR_ATTESTATIONS_POLLING_INTERVAL_MS',
    description: 'Interval between polling for new attestations',
    ...numberConfigHelper(200),
  },
  attestationWaitTimeoutMs: {
    env: 'VALIDATOR_ATTESTATIONS_WAIT_TIMEOUT_MS',
    description: 'Wait for attestations timeout',
    ...numberConfigHelper(AZTEC_SLOT_DURATION * 1000),
  },
};

/**
 * Returns the prover configuration from the environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns The validator configuration.
 */
export function getProverEnvVars(): ValidatorClientConfig {
  return getConfigFromMappings<ValidatorClientConfig>(validatorClientConfigMappings);
}
