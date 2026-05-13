import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
  pickConfigMappings,
  secretValueConfigHelper,
} from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { chainConfigMappings, validatorConstraintsConfigMappings } from '@aztec/stdlib/config';
import { localSignerConfigMappings, validatorHASignerConfigMappings } from '@aztec/stdlib/ha-signing';
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
  ...pickConfigMappings(chainConfigMappings, ['l1ChainId']),
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
  alwaysReexecuteBlockProposals: {
    description:
      'Whether to always reexecute block proposals, even for non-validator nodes (useful for monitoring network status).',
    defaultValue: true,
  },
  skipCheckpointProposalValidation: {
    description: 'Skip checkpoint proposal validation and always attest (default: false)',
    defaultValue: false,
  },
  skipPushProposedBlocksToArchiver: {
    description: 'Skip pushing re-executed blocks to archiver (default: false)',
    defaultValue: false,
  },
  attestToEquivocatedProposals: {
    description: 'Agree to attest to equivocated checkpoint proposals (for testing purposes only)',
    ...booleanConfigHelper(false),
  },
  ...validatorConstraintsConfigMappings,
  ...localSignerConfigMappings,
  ...validatorHASignerConfigMappings,
};

/**
 * Returns the prover configuration from the environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns The validator configuration.
 */
export function getProverEnvVars(): ValidatorClientConfig {
  return getConfigFromMappings<ValidatorClientConfig>(validatorClientConfigMappings);
}
