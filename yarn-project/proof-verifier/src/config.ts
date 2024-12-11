import { EthAddress } from '@aztec/circuits.js';
import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
} from '@aztec/foundation/config';
import { type TelemetryClientConfig, telemetryClientConfigMappings } from '@aztec/telemetry-client/start';

export type ProofVerifierConfig = {
  /** The URL to an L1 node */
  l1Url: string;
  /** The L1 chain ID */
  l1ChainId: number;
  /** Start block number */
  l1StartBlock: number;
  /** The address of the Rollup contract */
  rollupAddress: EthAddress;
  /** How often to poll L1 for proof submission */
  pollIntervalMs: number;
  /** The path to the bb binary */
  bbBinaryPath: string;
  /** Where bb stores temporary files */
  bbWorkingDirectory: string;
  /** Whether to skip cleanup of bb temporary files */
  bbSkipCleanup: boolean;
  /** The polling interval viem uses in ms */
  viemPollingIntervalMS: number;
} & TelemetryClientConfig;

export const proofVerifierConfigMappings: ConfigMappingsType<ProofVerifierConfig> = {
  ...telemetryClientConfigMappings,
  l1Url: {
    env: 'ETHEREUM_HOST',
    description: 'The URL to an L1 node',
  },
  l1ChainId: {
    env: 'L1_CHAIN_ID',
    parseEnv: (val: string) => +val,
    defaultValue: 31337,
    description: 'The chain ID of the ethereum host.',
  },
  l1StartBlock: {
    env: 'PROOF_VERIFIER_L1_START_BLOCK',
    description: 'Start block number',
    ...numberConfigHelper(1),
  },
  rollupAddress: {
    env: 'ROLLUP_CONTRACT_ADDRESS',
    description: 'The address of the Rollup contract',
    parseEnv: EthAddress.fromString,
  },
  pollIntervalMs: {
    env: 'PROOF_VERIFIER_POLL_INTERVAL_MS',
    description: 'How often to poll L1 for proof submission',
    ...numberConfigHelper(60_000),
  },
  bbBinaryPath: {
    env: 'BB_BINARY_PATH',
    description: 'The path to the bb binary',
  },
  bbWorkingDirectory: {
    env: 'BB_WORKING_DIRECTORY',
    description: 'Where bb stores temporary files',
  },
  bbSkipCleanup: {
    env: 'BB_SKIP_CLEANUP',
    description: 'Whether to skip cleanup of bb temporary files',
    ...booleanConfigHelper(false),
  },
  viemPollingIntervalMS: {
    env: 'VERIFIER_VIEM_POLLING_INTERVAL_MS',
    description: 'The polling interval viem uses in ms',
    ...numberConfigHelper(1_000),
  },
};

export function getProofVerifierConfigFromEnv(): ProofVerifierConfig {
  return getConfigFromMappings(proofVerifierConfigMappings);
}
