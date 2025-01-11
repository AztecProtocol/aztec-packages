import { type AllowedElement, type SequencerConfig } from '@aztec/circuit-types/config';
import { AztecAddress, Fr, FunctionSelector } from '@aztec/circuits.js';
import {
  type L1ContractsConfig,
  type L1ReaderConfig,
  l1ContractsConfigMappings,
  l1ReaderConfigMappings,
} from '@aztec/ethereum';
import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
} from '@aztec/foundation/config';
import { pickConfigMappings } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';

import {
  type PublisherConfig,
  type TxSenderConfig,
  getPublisherConfigMappings,
  getTxSenderConfigMappings,
} from './publisher/config.js';

export * from './publisher/config.js';
export { SequencerConfig };

/** Chain configuration. */
type ChainConfig = {
  /** The chain id of the ethereum host. */
  l1ChainId: number;
  /** The version of the rollup. */
  version: number;
};

/**
 * Configuration settings for the SequencerClient.
 */
export type SequencerClientConfig = PublisherConfig &
  TxSenderConfig &
  SequencerConfig &
  L1ReaderConfig &
  ChainConfig &
  Pick<L1ContractsConfig, 'ethereumSlotDuration'>;

export const sequencerConfigMappings: ConfigMappingsType<SequencerConfig> = {
  transactionPollingIntervalMS: {
    env: 'SEQ_TX_POLLING_INTERVAL_MS',
    description: 'The number of ms to wait between polling for pending txs.',
    ...numberConfigHelper(1_000),
  },
  maxTxsPerBlock: {
    env: 'SEQ_MAX_TX_PER_BLOCK',
    description: 'The maximum number of txs to include in a block.',
    ...numberConfigHelper(32),
  },
  minTxsPerBlock: {
    env: 'SEQ_MIN_TX_PER_BLOCK',
    description: 'The minimum number of txs to include in a block.',
    ...numberConfigHelper(1),
  },
  maxL2BlockGas: {
    env: 'SEQ_MAX_L2_BLOCK_GAS',
    description: 'The maximum L2 block gas.',
    ...numberConfigHelper(10e9),
  },
  maxDABlockGas: {
    env: 'SEQ_MAX_DA_BLOCK_GAS',
    description: 'The maximum DA block gas.',
    ...numberConfigHelper(10e9),
  },
  coinbase: {
    env: 'COINBASE',
    parseEnv: (val: string) => EthAddress.fromString(val),
    description: 'Recipient of block reward.',
  },
  feeRecipient: {
    env: 'FEE_RECIPIENT',
    parseEnv: (val: string) => AztecAddress.fromString(val),
    description: 'Address to receive fees.',
  },
  acvmWorkingDirectory: {
    env: 'ACVM_WORKING_DIRECTORY',
    description: 'The working directory to use for simulation/proving',
  },
  acvmBinaryPath: {
    env: 'ACVM_BINARY_PATH',
    description: 'The path to the ACVM binary',
  },
  allowedInSetup: {
    env: 'SEQ_ALLOWED_SETUP_FN',
    parseEnv: (val: string) => parseSequencerAllowList(val),
    description: 'The list of functions calls allowed to run in setup',
    printDefault: () =>
      'AuthRegistry, FeeJuice.increase_public_balance, Token.increase_public_balance, FPC.prepare_fee',
  },
  maxBlockSizeInBytes: {
    env: 'SEQ_MAX_BLOCK_SIZE_IN_BYTES',
    description: 'Max block size',
    ...numberConfigHelper(1024 * 1024),
  },
  enforceFees: {
    env: 'ENFORCE_FEES',
    description: 'Whether to require every tx to have a fee payer',
    ...booleanConfigHelper(),
  },
  enforceTimeTable: {
    env: 'SEQ_ENFORCE_TIME_TABLE',
    description: 'Whether to enforce the time table when building blocks',
    ...booleanConfigHelper(),
    defaultValue: false,
  },
  governanceProposerPayload: {
    env: 'GOVERNANCE_PROPOSER_PAYLOAD_ADDRESS',
    description: 'The address of the payload for the governanceProposer',
    parseEnv: (val: string) => EthAddress.fromString(val),
    defaultValue: EthAddress.ZERO,
  },
  maxL1TxInclusionTimeIntoSlot: {
    env: 'SEQ_MAX_L1_TX_INCLUSION_TIME_INTO_SLOT',
    description: 'How many seconds into an L1 slot we can still send a tx and get it mined.',
    parseEnv: (val: string) => (val ? parseInt(val, 10) : undefined),
  },
};

export const chainConfigMappings: ConfigMappingsType<ChainConfig> = {
  l1ChainId: l1ReaderConfigMappings.l1ChainId,
  version: {
    env: 'VERSION',
    description: 'The version of the rollup.',
    ...numberConfigHelper(1),
  },
};

export const sequencerClientConfigMappings: ConfigMappingsType<SequencerClientConfig> = {
  ...sequencerConfigMappings,
  ...l1ReaderConfigMappings,
  ...getTxSenderConfigMappings('SEQ'),
  ...getPublisherConfigMappings('SEQ'),
  ...chainConfigMappings,
  ...pickConfigMappings(l1ContractsConfigMappings, ['ethereumSlotDuration']),
};

/**
 * Creates an instance of SequencerClientConfig out of environment variables using sensible defaults for integration testing if not set.
 */
export function getConfigEnvVars(): SequencerClientConfig {
  return getConfigFromMappings<SequencerClientConfig>(sequencerClientConfigMappings);
}

/**
 * Parses a string to a list of allowed elements.
 * Each encoded is expected to be of one of the following formats
 * `I:${address}`
 * `I:${address}:${selector}`
 * `C:${classId}`
 * `C:${classId}:${selector}`
 *
 * @param value The string to parse
 * @returns A list of allowed elements
 */
export function parseSequencerAllowList(value: string): AllowedElement[] {
  const entries: AllowedElement[] = [];

  if (!value) {
    return entries;
  }

  for (const val of value.split(',')) {
    const [typeString, identifierString, selectorString] = val.split(':');
    const selector = selectorString !== undefined ? FunctionSelector.fromString(selectorString) : undefined;

    if (typeString === 'I') {
      if (selector) {
        entries.push({
          address: AztecAddress.fromString(identifierString),
          selector,
        });
      } else {
        entries.push({
          address: AztecAddress.fromString(identifierString),
        });
      }
    } else if (typeString === 'C') {
      if (selector) {
        entries.push({
          classId: Fr.fromHexString(identifierString),
          selector,
        });
      } else {
        entries.push({
          classId: Fr.fromHexString(identifierString),
        });
      }
    }
  }

  return entries;
}
