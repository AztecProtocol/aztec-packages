import {
  type ConfigMappingsType,
  booleanConfigHelper,
  buildConfigFromEnv,
  composeConfigMappings,
  numberConfigHelper,
  parseCommaSeparated,
  secretValueConfigHelper,
} from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import {
  l1ChainIdConfigMapping,
  pushProposedBlocksToArchiverConfigMappings,
  validatorConstraintsConfigMappings,
} from '@aztec/stdlib/config';
import { localSignerConfigMappings, validatorHASignerConfigMappings } from '@aztec/stdlib/ha-signing';
import type { OwnValidatorClientConfig, ValidatorClientConfig } from '@aztec/stdlib/interfaces/server';

export type { ValidatorClientConfig };

const ownValidatorClientConfigMappings: ConfigMappingsType<OwnValidatorClientConfig> = {
  validatorPrivateKeys: {
    env: 'VALIDATOR_PRIVATE_KEYS',
    description: 'List of private keys of the validators participating in attestation duties',
    ...secretValueConfigHelper<`0x${string}`[]>(val =>
      val ? parseCommaSeparated(val).map<`0x${string}`>(key => `0x${key.replace('0x', '')}`) : [],
    ),
    fallback: ['VALIDATOR_PRIVATE_KEY'],
  },
  validatorAddresses: {
    env: 'VALIDATOR_ADDRESSES',
    description: 'List of addresses of the validators to use with remote signers',
    parseEnv: (val: string) => parseCommaSeparated(val).map(address => EthAddress.fromString(address)),
    defaultValue: [],
  },
  disableValidator: {
    env: 'VALIDATOR_DISABLED',
    description: 'Do not run the validator',
    ...booleanConfigHelper(false),
  },
  disabledValidators: {
    description: 'Temporarily disable these specific validator addresses',
    parseEnv: (val: string) => parseCommaSeparated(val).map(address => EthAddress.fromString(address)),
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
  attestToEquivocatedProposals: {
    description: 'Agree to attest to equivocated checkpoint proposals (for testing purposes only)',
    ...booleanConfigHelper(false),
  },
};

export const validatorClientConfigMappings: ConfigMappingsType<ValidatorClientConfig> = composeConfigMappings(
  ownValidatorClientConfigMappings,
  pushProposedBlocksToArchiverConfigMappings,
  l1ChainIdConfigMapping,
  validatorConstraintsConfigMappings,
  localSignerConfigMappings,
  validatorHASignerConfigMappings,
);

/**
 * Returns the prover configuration from the environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns The validator configuration.
 */
export function getProverEnvVars(): ValidatorClientConfig {
  return buildConfigFromEnv<ValidatorClientConfig>(validatorClientConfigMappings);
}
