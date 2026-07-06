import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
  optionalNumberConfigHelper,
  pickConfigMappings,
  secretValueConfigHelper,
} from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type SequencerConfig, sharedSequencerConfigMappings } from '@aztec/stdlib/config';
import { localSignerConfigMappings, validatorHASignerConfigMappings } from '@aztec/stdlib/ha-signing';
import type { ValidatorClientConfig } from '@aztec/stdlib/interfaces/server';

export type { ValidatorClientConfig };

/**
 * Default clock-disparity tolerance (ms) for proposal/attestation receive windows, mirroring the p2p config
 * default. Used by the validator-client validators when the merged node config does not carry the value.
 */
export const DEFAULT_MAX_GOSSIP_CLOCK_DISPARITY_MS = 500;

export const validatorClientConfigMappings: ConfigMappingsType<
  ValidatorClientConfig & Pick<SequencerConfig, 'blockDurationMs'>
> = {
  ...pickConfigMappings(sharedSequencerConfigMappings, ['blockDurationMs']),
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
  l1ChainId: {
    env: 'L1_CHAIN_ID',
    description: 'The chain ID of the ethereum host.',
    parseEnv: (val: string) => +val,
    defaultValue: 31337,
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
  injectYParityOwnAttestation: {
    description: "Rewrite this validator's own attestation to yParity form after signing (for testing only)",
    ...booleanConfigHelper(false),
  },
  skipProposalSlotValidation: {
    description: 'Accept proposal validation regardless of slot timing (for testing only)',
    ...booleanConfigHelper(false),
  },
  validateMaxL2BlockGas: {
    env: 'VALIDATOR_MAX_L2_BLOCK_GAS',
    description: 'Maximum L2 block gas for validation. Proposals exceeding this limit are rejected.',
    ...optionalNumberConfigHelper(),
  },
  validateMaxDABlockGas: {
    env: 'VALIDATOR_MAX_DA_BLOCK_GAS',
    description: 'Maximum DA block gas for validation. Proposals exceeding this limit are rejected.',
    ...optionalNumberConfigHelper(),
  },
  validateMaxTxsPerBlock: {
    env: 'VALIDATOR_MAX_TX_PER_BLOCK',
    description: 'Maximum transactions per block for validation. Proposals exceeding this limit are rejected.',
    ...optionalNumberConfigHelper(),
  },
  validateMaxTxsPerCheckpoint: {
    env: 'VALIDATOR_MAX_TX_PER_CHECKPOINT',
    description: 'Maximum transactions per checkpoint for validation. Proposals exceeding this limit are rejected.',
    ...optionalNumberConfigHelper(),
  },
  ...localSignerConfigMappings,
  ...validatorHASignerConfigMappings,
};

/**
 * Returns the prover configuration from the environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns The validator configuration.
 */
export function getProverEnvVars(): ValidatorClientConfig & Pick<SequencerConfig, 'blockDurationMs'> {
  return getConfigFromMappings<ValidatorClientConfig & Pick<SequencerConfig, 'blockDurationMs'>>(
    validatorClientConfigMappings,
  );
}
