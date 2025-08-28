import { EthAddress } from '@aztec/aztec.js';
import { DefaultL1ContractsConfig } from '@aztec/ethereum';
import type { EnvVar, NetworkNames } from '@aztec/foundation/config';
import type { SharedNodeConfig } from '@aztec/node-lib/config';

import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import path, { dirname, join } from 'path';

import publicIncludeMetrics from '../../public_include_metric_prefixes.json' with { type: 'json' };

// REFACTOR: We should be `pick`ing keys from existing config types
export type L2ChainConfig = {
  l1ChainId: number;
  testAccounts: boolean;
  sponsoredFPC: boolean;
  p2pEnabled: boolean;
  p2pBootstrapNodes: string[];
  registryAddress: string;
  slashFactoryAddress: string;
  feeAssetHandlerAddress: string;
  seqMinTxsPerBlock: number;
  seqMaxTxsPerBlock: number;
  realProofs: boolean;
  snapshotsUrl: string;
  autoUpdate: SharedNodeConfig['autoUpdate'];
  autoUpdateUrl?: string;
  maxTxPoolSize: number;
  publicIncludeMetrics?: string[];
  publicMetricsCollectorUrl?: string;
  publicMetricsCollectFrom?: string[];

  // Deployment stuff

  /** How many seconds an L1 slot lasts. */
  ethereumSlotDuration: number;
  /** How many seconds an L2 slots lasts (must be multiple of ethereum slot duration). */
  aztecSlotDuration: number;
  /** How many L2 slots an epoch lasts. */
  aztecEpochDuration: number;
  /** The target validator committee size. */
  aztecTargetCommitteeSize: number;
  /** The number of epochs after an epoch ends that proofs are still accepted. */
  aztecProofSubmissionEpochs: number;
  /** The deposit amount for a validator */
  activationThreshold: bigint;
  /** The minimum stake for a validator. */
  ejectionThreshold: bigint;
  /** The slashing quorum */
  slashingQuorum: number;
  /** The slashing round size */
  slashingRoundSize: number;
  /** Governance proposing quorum */
  governanceProposerQuorum: number;
  /** Governance proposing round size */
  governanceProposerRoundSize: number;
  /** The mana target for the rollup */
  manaTarget: bigint;
  /** The proving cost per mana */
  provingCostPerMana: bigint;

  // slashing stuff
  slashPayloadTtlSeconds: number;
  slashPruneEnabled: boolean;
  slashPrunePenalty: bigint;
  slashPruneMaxPenalty: bigint;
  slashInactivityEnabled: boolean;
  slashInactivityCreateTargetPercentage: number;
  slashInactivitySignalTargetPercentage: number;
  slashInactivityCreatePenalty: bigint;
  slashInactivityMaxPenalty: bigint;
  slashBroadcastedInvalidBlockEnabled: boolean;
  slashBroadcastedInvalidBlockPenalty: bigint;
  slashBroadcastedInvalidBlockMaxPenalty: bigint;
  slashProposeInvalidAttestationsPenalty: bigint;
  slashProposeInvalidAttestationsMaxPenalty: bigint;
  slashAttestDescendantOfInvalidPenalty: bigint;
  slashAttestDescendantOfInvalidMaxPenalty: bigint;
  slashUnknownPenalty: bigint;
  slashUnknownMaxPenalty: bigint;
  // control whether sentinel is enabled or not. Needed for slashing
  sentinelEnabled: boolean;
};

export const testnetIgnitionL2ChainConfig: L2ChainConfig = {
  l1ChainId: 11155111,
  testAccounts: true,
  sponsoredFPC: false,
  p2pEnabled: true,
  p2pBootstrapNodes: [],
  registryAddress: '0x12b3ebc176a1646b911391eab3760764f2e05fe3',
  slashFactoryAddress: '',
  feeAssetHandlerAddress: '',
  seqMinTxsPerBlock: 0,
  seqMaxTxsPerBlock: 0,
  realProofs: true,
  snapshotsUrl: 'https://storage.googleapis.com/aztec-testnet/snapshots/',
  autoUpdate: 'disabled',
  autoUpdateUrl: undefined,
  maxTxPoolSize: 100_000_000, // 100MB

  // Deployment stuff
  /** How many seconds an L1 slot lasts. */
  ethereumSlotDuration: 12,
  /** How many seconds an L2 slots lasts (must be multiple of ethereum slot duration). */
  aztecSlotDuration: 36,
  /** How many L2 slots an epoch lasts. */
  aztecEpochDuration: 32,
  /** The target validator committee size. */
  aztecTargetCommitteeSize: 48,
  /** The number of epochs after an epoch ends that proofs are still accepted. */
  aztecProofSubmissionEpochs: 1,
  /** The deposit amount for a validator */
  activationThreshold: DefaultL1ContractsConfig.activationThreshold,
  /** The minimum stake for a validator. */
  ejectionThreshold: DefaultL1ContractsConfig.ejectionThreshold,
  /** The slashing quorum */
  slashingQuorum: DefaultL1ContractsConfig.slashingQuorum,
  /** The slashing round size */
  slashingRoundSize: DefaultL1ContractsConfig.slashingRoundSize,
  /** Governance proposing quorum */
  governanceProposerQuorum: DefaultL1ContractsConfig.governanceProposerQuorum,
  /** Governance proposing round size */
  governanceProposerRoundSize: DefaultL1ContractsConfig.governanceProposerRoundSize,
  /** The mana target for the rollup */
  manaTarget: 0n,
  /** The proving cost per mana */
  provingCostPerMana: 0n,

  // slashing stuff
  slashInactivityEnabled: false,
  slashInactivityCreateTargetPercentage: 0,
  slashInactivitySignalTargetPercentage: 0,
  slashInactivityCreatePenalty: 0n,
  slashInactivityMaxPenalty: 0n,
  slashPayloadTtlSeconds: 0,
  slashPruneEnabled: false,
  slashPrunePenalty: 0n,
  slashPruneMaxPenalty: 0n,
  slashProposeInvalidAttestationsPenalty: 0n,
  slashProposeInvalidAttestationsMaxPenalty: 0n,
  slashAttestDescendantOfInvalidPenalty: 0n,
  slashAttestDescendantOfInvalidMaxPenalty: 0n,
  slashUnknownPenalty: 0n,
  slashUnknownMaxPenalty: 0n,
  slashBroadcastedInvalidBlockEnabled: false,
  slashBroadcastedInvalidBlockPenalty: 0n,
  slashBroadcastedInvalidBlockMaxPenalty: 0n,
  sentinelEnabled: false,
};

export const alphaTestnetL2ChainConfig: L2ChainConfig = {
  l1ChainId: 11155111,
  testAccounts: false,
  sponsoredFPC: true,
  p2pEnabled: true,
  p2pBootstrapNodes: [],
  registryAddress: '0xec4156431d0f3df66d4e24ba3d30dcb4c85fa309',
  slashFactoryAddress: '0x8b1566249dc8fb47234037538ce491f9500480b1',
  feeAssetHandlerAddress: '0x4f0376b8bcbdf72ddb38c38f48317c00e9c9aec3',
  seqMinTxsPerBlock: 0,
  seqMaxTxsPerBlock: 20,
  realProofs: true,
  snapshotsUrl: 'https://storage.googleapis.com/aztec-testnet/snapshots/',
  autoUpdate: 'config-and-version',
  autoUpdateUrl: 'https://storage.googleapis.com/aztec-testnet/auto-update/alpha-testnet.json',
  maxTxPoolSize: 100_000_000, // 100MB
  publicIncludeMetrics,
  publicMetricsCollectorUrl: 'https://telemetry.alpha-testnet.aztec.network/v1/metrics',
  publicMetricsCollectFrom: ['sequencer'],

  // Deployment stuff
  /** How many seconds an L1 slot lasts. */
  ethereumSlotDuration: 12,
  /** How many seconds an L2 slots lasts (must be multiple of ethereum slot duration). */
  aztecSlotDuration: 36,
  /** How many L2 slots an epoch lasts. */
  aztecEpochDuration: 32,
  /** The target validator committee size. */
  aztecTargetCommitteeSize: 48,
  /** The number of epochs after an epoch ends that proofs are still accepted. */
  aztecProofSubmissionEpochs: 1,
  /** The deposit amount for a validator */
  activationThreshold: DefaultL1ContractsConfig.activationThreshold,
  /** The minimum stake for a validator. */
  ejectionThreshold: DefaultL1ContractsConfig.ejectionThreshold,
  /** The slashing round size */
  slashingRoundSize: 32 * 6, // 6 epochs
  /** The slashing quorum */
  slashingQuorum: (32 * 6) / 2 + 1, // 6 epochs, majority of validators
  /** Governance proposing quorum */
  governanceProposerQuorum: 151,
  /** Governance proposing round size */
  governanceProposerRoundSize: 300,
  /** The mana target for the rollup */
  manaTarget: DefaultL1ContractsConfig.manaTarget,
  /** The proving cost per mana */
  provingCostPerMana: DefaultL1ContractsConfig.provingCostPerMana,

  // slashing stuff
  slashPayloadTtlSeconds: 36 * 32 * 24, // 24 epochs
  slashPruneEnabled: true,
  slashPrunePenalty: 17n * (DefaultL1ContractsConfig.activationThreshold / 100n),
  slashPruneMaxPenalty: 17n * (DefaultL1ContractsConfig.activationThreshold / 100n),
  slashInactivityEnabled: true,
  slashInactivityCreateTargetPercentage: 1,
  slashInactivitySignalTargetPercentage: 0.67,
  slashInactivityCreatePenalty: 17n * (DefaultL1ContractsConfig.activationThreshold / 100n),
  slashInactivityMaxPenalty: 17n * (DefaultL1ContractsConfig.activationThreshold / 100n),
  slashBroadcastedInvalidBlockEnabled: true,
  slashBroadcastedInvalidBlockPenalty: DefaultL1ContractsConfig.activationThreshold,
  slashBroadcastedInvalidBlockMaxPenalty: DefaultL1ContractsConfig.activationThreshold,
  slashProposeInvalidAttestationsPenalty: DefaultL1ContractsConfig.activationThreshold,
  slashProposeInvalidAttestationsMaxPenalty: DefaultL1ContractsConfig.activationThreshold,
  slashAttestDescendantOfInvalidPenalty: DefaultL1ContractsConfig.activationThreshold,
  slashAttestDescendantOfInvalidMaxPenalty: DefaultL1ContractsConfig.activationThreshold,
  slashUnknownPenalty: 17n * (DefaultL1ContractsConfig.activationThreshold / 100n),
  slashUnknownMaxPenalty: 17n * (DefaultL1ContractsConfig.activationThreshold / 100n),
  sentinelEnabled: true,
};

const BOOTNODE_CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour;

export async function getBootnodes(networkName: NetworkNames, cacheDir?: string) {
  const cacheFile = cacheDir ? join(cacheDir, networkName, 'bootnodes.json') : undefined;
  try {
    if (cacheFile) {
      const info = await stat(cacheFile);
      if (info.mtimeMs + BOOTNODE_CACHE_DURATION_MS > Date.now()) {
        return JSON.parse(await readFile(cacheFile, 'utf-8'))['bootnodes'];
      }
    }
  } catch {
    // no-op. Get the remote-file
  }

  const url = `http://static.aztec.network/${networkName}/bootnodes.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch basic contract addresses from ${url}. Check you are using a correct network name.`,
    );
  }
  const json = await response.json();

  try {
    if (cacheFile) {
      await mkdir(dirname(cacheFile), { recursive: true });
      await writeFile(cacheFile, JSON.stringify(json), 'utf-8');
    }
  } catch {
    // no-op
  }

  return json['bootnodes'];
}

export async function getL2ChainConfig(
  networkName: NetworkNames,
  cacheDir?: string,
): Promise<L2ChainConfig | undefined> {
  if (networkName === 'testnet-ignition') {
    const config = { ...testnetIgnitionL2ChainConfig };
    config.p2pBootstrapNodes = await getBootnodes(networkName, cacheDir);
    return config;
  } else if (networkName === 'alpha-testnet' || networkName === 'testnet') {
    const config = { ...alphaTestnetL2ChainConfig };
    config.p2pBootstrapNodes = await getBootnodes('alpha-testnet', cacheDir);
    return config;
  }
  return undefined;
}

function enrichVar(envVar: EnvVar, value: string) {
  // Don't override
  if (process.env[envVar]) {
    return;
  }
  process.env[envVar] = value;
}

function enrichEthAddressVar(envVar: EnvVar, value: string) {
  // EthAddress doesn't like being given empty strings
  if (value === '') {
    enrichVar(envVar, EthAddress.ZERO.toString());
    return;
  }
  enrichVar(envVar, value);
}

function getDefaultDataDir(networkName: NetworkNames): string {
  let prefix: string;
  if (networkName === 'testnet-ignition') {
    prefix = 'testnet-ignition';
  } else if (networkName === 'alpha-testnet' || networkName === 'testnet') {
    prefix = 'alpha-testnet';
  } else {
    prefix = networkName;
  }

  return path.join(process.env.HOME || '~', '.aztec', prefix, 'data');
}

export async function enrichEnvironmentWithChainConfig(networkName: NetworkNames) {
  if (networkName === 'local') {
    return;
  }

  enrichVar('DATA_DIRECTORY', getDefaultDataDir(networkName));
  const cacheDir = process.env.DATA_DIRECTORY ? join(process.env.DATA_DIRECTORY, 'cache') : undefined;
  const config = await getL2ChainConfig(networkName, cacheDir);

  if (!config) {
    throw new Error(`Unknown network name: ${networkName}`);
  }

  enrichVar('BOOTSTRAP_NODES', config.p2pBootstrapNodes.join(','));
  enrichVar('TEST_ACCOUNTS', config.testAccounts.toString());
  enrichVar('SPONSORED_FPC', config.sponsoredFPC.toString());
  enrichVar('P2P_ENABLED', config.p2pEnabled.toString());
  enrichVar('L1_CHAIN_ID', config.l1ChainId.toString());
  enrichVar('SEQ_MIN_TX_PER_BLOCK', config.seqMinTxsPerBlock.toString());
  enrichVar('SEQ_MAX_TX_PER_BLOCK', config.seqMaxTxsPerBlock.toString());
  enrichVar('PROVER_REAL_PROOFS', config.realProofs.toString());
  enrichVar('PXE_PROVER_ENABLED', config.realProofs.toString());
  enrichVar('SYNC_SNAPSHOTS_URL', config.snapshotsUrl);
  enrichVar('P2P_MAX_TX_POOL_SIZE', config.maxTxPoolSize.toString());

  if (config.autoUpdate) {
    enrichVar('AUTO_UPDATE', config.autoUpdate?.toString());
  }

  if (config.autoUpdateUrl) {
    enrichVar('AUTO_UPDATE_URL', config.autoUpdateUrl);
  }

  if (config.publicIncludeMetrics) {
    enrichVar('PUBLIC_OTEL_INCLUDE_METRICS', config.publicIncludeMetrics.join(','));
  }

  if (config.publicMetricsCollectorUrl) {
    enrichVar('PUBLIC_OTEL_EXPORTER_OTLP_METRICS_ENDPOINT', config.publicMetricsCollectorUrl);
  }

  if (config.publicMetricsCollectFrom) {
    enrichVar('PUBLIC_OTEL_COLLECT_FROM', config.publicMetricsCollectFrom.join(','));
  }

  enrichEthAddressVar('REGISTRY_CONTRACT_ADDRESS', config.registryAddress);
  enrichEthAddressVar('SLASH_FACTORY_CONTRACT_ADDRESS', config.slashFactoryAddress);
  enrichEthAddressVar('FEE_ASSET_HANDLER_CONTRACT_ADDRESS', config.feeAssetHandlerAddress);

  // Deployment stuff
  enrichVar('ETHEREUM_SLOT_DURATION', config.ethereumSlotDuration.toString());
  enrichVar('AZTEC_SLOT_DURATION', config.aztecSlotDuration.toString());
  enrichVar('AZTEC_EPOCH_DURATION', config.aztecEpochDuration.toString());
  enrichVar('AZTEC_TARGET_COMMITTEE_SIZE', config.aztecTargetCommitteeSize.toString());
  enrichVar('AZTEC_PROOF_SUBMISSION_EPOCHS', config.aztecProofSubmissionEpochs.toString());
  enrichVar('AZTEC_ACTIVATION_THRESHOLD', config.activationThreshold.toString());
  enrichVar('AZTEC_EJECTION_THRESHOLD', config.ejectionThreshold.toString());
  enrichVar('AZTEC_SLASHING_QUORUM', config.slashingQuorum.toString());
  enrichVar('AZTEC_SLASHING_ROUND_SIZE', config.slashingRoundSize.toString());
  enrichVar('AZTEC_GOVERNANCE_PROPOSER_QUORUM', config.governanceProposerQuorum.toString());
  enrichVar('AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE', config.governanceProposerRoundSize.toString());
  enrichVar('AZTEC_MANA_TARGET', config.manaTarget.toString());
  enrichVar('AZTEC_PROVING_COST_PER_MANA', config.provingCostPerMana.toString());

  // Slashing
  enrichVar('SLASH_PAYLOAD_TTL_SECONDS', config.slashPayloadTtlSeconds.toString());
  enrichVar('SLASH_PRUNE_ENABLED', config.slashPruneEnabled.toString());
  enrichVar('SLASH_PRUNE_PENALTY', config.slashPrunePenalty.toString());
  enrichVar('SLASH_PRUNE_MAX_PENALTY', config.slashPruneMaxPenalty.toString());
  enrichVar('SLASH_INACTIVITY_ENABLED', config.slashInactivityEnabled.toString());
  enrichVar('SLASH_INACTIVITY_CREATE_TARGET_PERCENTAGE', config.slashInactivityCreateTargetPercentage.toString());
  enrichVar('SLASH_INACTIVITY_SIGNAL_TARGET_PERCENTAGE', config.slashInactivitySignalTargetPercentage.toString());
  enrichVar('SLASH_INACTIVITY_CREATE_PENALTY', config.slashInactivityCreatePenalty.toString());
  enrichVar('SLASH_INACTIVITY_MAX_PENALTY', config.slashInactivityMaxPenalty.toString());
  enrichVar('SLASH_INVALID_BLOCK_ENABLED', config.slashBroadcastedInvalidBlockEnabled.toString());
  enrichVar('SLASH_INVALID_BLOCK_PENALTY', config.slashBroadcastedInvalidBlockPenalty.toString());
  enrichVar('SLASH_INVALID_BLOCK_MAX_PENALTY', config.slashBroadcastedInvalidBlockMaxPenalty.toString());
  enrichVar('SLASH_PROPOSE_INVALID_ATTESTATIONS_PENALTY', config.slashProposeInvalidAttestationsPenalty.toString());
  enrichVar(
    'SLASH_PROPOSE_INVALID_ATTESTATIONS_MAX_PENALTY',
    config.slashProposeInvalidAttestationsMaxPenalty.toString(),
  );
  enrichVar('SLASH_ATTEST_DESCENDANT_OF_INVALID_PENALTY', config.slashAttestDescendantOfInvalidPenalty.toString());
  enrichVar(
    'SLASH_ATTEST_DESCENDANT_OF_INVALID_MAX_PENALTY',
    config.slashAttestDescendantOfInvalidMaxPenalty.toString(),
  );
  enrichVar('SLASH_UNKNOWN_PENALTY', config.slashUnknownPenalty.toString());
  enrichVar('SLASH_UNKNOWN_MAX_PENALTY', config.slashUnknownMaxPenalty.toString());

  enrichVar('SENTINEL_ENABLED', config.sentinelEnabled.toString());
}
