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
  sequencerPrivateKeys: {
    env: 'SEQUENCER_PRIVATE_KEYS',
    description: 'List of private keys of the sequencers participating in attestation duties',
    ...secretValueConfigHelper<`0x${string}`[]>(val =>
      val ? val.split(',').map<`0x${string}`>(key => `0x${key.replace('0x', '')}`) : [],
    ),
    fallback: [
      'SEQUENCER_PRIVATE_KEY',
      'ATTESTER_PRIVATE_KEYS',
      'ATTESTER_PRIVATE_KEY',
      'VALIDATOR_PRIVATE_KEYS',
      'VALIDATOR_PRIVATE_KEY',
    ],
  },
  sequencerAddresses: {
    env: 'SEQUENCER_ADDRESSES',
    description: 'List of addresses of the sequencers to use with remote signers for attestation',
    parseEnv: (val: string) =>
      val
        .split(',')
        .filter(address => address && address.trim().length > 0)
        .map(address => EthAddress.fromString(address.trim())),
    defaultValue: [],
    fallback: ['ATTESTER_ADDRESSES', 'VALIDATOR_ADDRESSES'],
  },
  disableSequencer: {
    env: 'SEQUENCER_DISABLED',
    description: 'Do not participate in attestation duties',
    ...booleanConfigHelper(false),
    fallback: ['ATTESTER_DISABLED', 'VALIDATOR_DISABLED'],
  },
  disabledSequencers: {
    env: 'DISABLED_SEQUENCERS',
    description: 'Temporarily disable these specific sequencer addresses',
    parseEnv: (val: string) =>
      val
        .split(',')
        .filter(address => address && address.trim().length > 0)
        .map(address => EthAddress.fromString(address.trim())),
    defaultValue: [],
  },
  attestationPollingIntervalMs: {
    env: 'ATTESTATION_POLLING_INTERVAL_MS',
    description: 'Interval between polling for new attestations',
    ...numberConfigHelper(200),
    fallback: ['VALIDATOR_ATTESTATIONS_POLLING_INTERVAL_MS'],
  },
  attesterReexecute: {
    env: 'ATTESTER_REEXECUTE',
    description: 'Re-execute transactions before attesting',
    ...booleanConfigHelper(true),
    fallback: ['VALIDATOR_REEXECUTE'],
  },
  attesterReexecuteDeadlineMs: {
    env: 'ATTESTER_REEXECUTE_DEADLINE_MS',
    description: 'Will re-execute until this many milliseconds are left in the slot',
    ...numberConfigHelper(6000),
    fallback: ['VALIDATOR_REEXECUTE_DEADLINE_MS'],
  },
  alwaysReexecuteBlockProposals: {
    env: 'ALWAYS_REEXECUTE_BLOCK_PROPOSALS',
    description:
      'Whether to always reexecute block proposals, even for non-sequencer nodes (useful for monitoring network status).',
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
