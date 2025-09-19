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
    fallback: ['SEQUENCER_PRIVATE_KEY'],
  },
  validatorAddresses: {
    env: 'SEQUENCER_ADDRESSES',
    description: 'List of addresses of the sequencers to use with remote signers',
    parseEnv: (val: string) =>
      val
        .split(',')
        .filter(address => address && address.trim().length > 0)
        .map(address => EthAddress.fromString(address.trim())),
    defaultValue: [],
  },
  disableSequencer: {
    env: 'SEQUENCER_DISABLED',
    description: 'Do not run the sequencer',
    ...booleanConfigHelper(false),
  },
  disabledSequencers: {
    description: 'Temporarily disable these specific sequencer addresses',
    parseEnv: (val: string) =>
      val
        .split(',')
        .filter(address => address && address.trim().length > 0)
        .map(address => EthAddress.fromString(address.trim())),
    defaultValue: [],
  },
  attestationPollingIntervalMs: {
    env: 'SEQUENCER_ATTESTATIONS_POLLING_INTERVAL_MS',
    description: 'Interval between polling for new attestations',
    ...numberConfigHelper(200),
  },
  sequencerReexecute: {
    env: 'SEQUENCER_REEXECUTE',
    description: 'Re-execute transactions before attesting',
    ...booleanConfigHelper(true),
  },
  sequencerReexecuteDeadlineMs: {
    env: 'SEQUENCER_REEXECUTE_DEADLINE_MS',
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
