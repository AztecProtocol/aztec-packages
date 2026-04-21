import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
  secretValueConfigHelper,
} from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
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
  fishermanMode: {
    env: 'FISHERMAN_MODE',
    description:
      'Whether to run in fisherman mode: validates all proposals and attestations but does not broadcast attestations or participate in consensus.',
    ...booleanConfigHelper(false),
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
  validateMaxL2BlockGas: {
    env: 'VALIDATOR_MAX_L2_BLOCK_GAS',
    description: 'Maximum L2 block gas for validation. Proposals exceeding this limit are rejected.',
    parseEnv: (val: string) => parseInt(val, 10),
  },
  validateMaxDABlockGas: {
    env: 'VALIDATOR_MAX_DA_BLOCK_GAS',
    description: 'Maximum DA block gas for validation. Proposals exceeding this limit are rejected.',
    parseEnv: (val: string) => parseInt(val, 10),
  },
  validateMaxTxsPerBlock: {
    env: 'VALIDATOR_MAX_TX_PER_BLOCK',
    description: 'Maximum transactions per block for validation. Proposals exceeding this limit are rejected.',
    parseEnv: (val: string) => parseInt(val, 10),
  },
  validateMaxTxsPerCheckpoint: {
    env: 'VALIDATOR_MAX_TX_PER_CHECKPOINT',
    description: 'Maximum transactions per checkpoint for validation. Proposals exceeding this limit are rejected.',
    parseEnv: (val: string) => parseInt(val, 10),
  },
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
