import { NULL_KEY, l1ContractsConfigMappings } from '@aztec/ethereum';
import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
  pickConfigMappings,
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

  /** Re-execute transactions before attesting */
  validatorReexecute: boolean;
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
    ...numberConfigHelper(
      getConfigFromMappings(pickConfigMappings(l1ContractsConfigMappings, ['aztecSlotDuration'])).aztecSlotDuration *
        1000,
    ),
  },
  validatorReexecute: {
    env: 'VALIDATOR_REEXECUTE',
    description: 'Re-execute transactions before attesting',
    ...booleanConfigHelper(true),
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
