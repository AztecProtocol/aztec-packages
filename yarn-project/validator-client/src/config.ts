import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
  secretValueConfigHelper,
} from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { ValidatorClientConfig } from '@aztec/stdlib/interfaces/server';

export type { ValidatorClientConfig };

export const validatorClientConfigMappings: ConfigMappingsType<ValidatorClientConfig> = {
  validatorPrivateKeys: {
    env: 'VALIDATOR_PRIVATE_KEYS',
    description: 'List of private keys of the validators participating in attestation duties',
    ...secretValueConfigHelper<`0x${string}`[]>(val =>
      val ? val.split(',').map<`0x${string}`>(key => `0x${key.replace('0x', '')}`) : [],
    ),
    fallback: ['VALIDATOR_PRIVATE_KEY'],
  },
  validatorAddresses: {
    env: 'VALIDATOR_ADDRESSES',
    description: 'List of addresses of the validators to use with remote signers',
    parseEnv: (val: string) =>
      val
        .split(',')
        .filter(address => address && address.trim().length > 0)
        .map(address => EthAddress.fromString(address.trim())),
    defaultValue: [],
  },
  disableValidator: {
    env: 'VALIDATOR_DISABLED',
    description: 'Do not run the validator',
    ...booleanConfigHelper(false),
  },
  disabledValidators: {
    description: 'Temporarily disable these specific validator addresses',
    parseEnv: (val: string) =>
      val
        .split(',')
        .filter(address => address && address.trim().length > 0)
        .map(address => EthAddress.fromString(address.trim())),
    defaultValue: [],
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
  alwaysReexecuteBlockProposals: {
    env: 'ALWAYS_REEXECUTE_BLOCK_PROPOSALS',
    description:
      'Whether to always reexecute block proposals, even for non-validator nodes (useful for monitoring network status).',
    ...booleanConfigHelper(false),
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
