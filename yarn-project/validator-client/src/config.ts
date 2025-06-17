import {
  type ConfigMappingsType,
  type SecretValue,
  booleanConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
  secretValueConfigHelper,
} from '@aztec/foundation/config';

/**
 * The Validator Configuration
 */
export interface ValidatorClientConfig {
  /** The private keys of the validators participating in attestation duties */
  validatorPrivateKeys: SecretValue<`0x${string}`[]>;

  /** Do not run the validator */
  disableValidator: boolean;

  /** Interval between polling for new attestations from peers */
  attestationPollingIntervalMs: number;

  /** Re-execute transactions before attesting */
  validatorReexecute: boolean;

  /** Will re-execute until this many milliseconds are left in the slot */
  validatorReexecuteDeadlineMs: number;
}

export const validatorClientConfigMappings: ConfigMappingsType<ValidatorClientConfig> = {
  validatorPrivateKeys: {
    env: 'VALIDATOR_PRIVATE_KEYS',
    description: 'List of private keys of the validators participating in attestation duties',
    ...secretValueConfigHelper<`0x${string}`[]>(val =>
      val ? val.split(',').map<`0x${string}`>(key => `0x${key.replace('0x', '')}`) : [],
    ),
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
  validatorReexecute: {
    env: 'VALIDATOR_REEXECUTE',
    description: 'Re-execute transactions before attesting',
    ...booleanConfigHelper(true),
  },
  validatorReexecuteDeadlineMs: {
    env: 'VALIDATOR_REEXECUTE_DEADLINE_MS',
    description: 'Will re-execute until this many milliseconds are left in the slot',
    ...numberConfigHelper(6000),
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
