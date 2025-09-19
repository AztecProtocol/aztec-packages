import { DefaultL1ContractsConfig, type L1ContractsConfig } from '@aztec/ethereum';
import type { EnvVar, NetworkNames } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { SharedNodeConfig } from '@aztec/node-lib/config';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';

import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import path, { dirname, join } from 'path';

import publicIncludeMetrics from '../../public_include_metric_prefixes.json' with { type: 'json' };

export type L2ChainConfig = L1ContractsConfig &
  Omit<SlasherConfig, 'slashValidatorsNever' | 'slashValidatorsAlways'> & {
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

    // Control whether sentinel is enabled or not. Needed for slashing
    sentinelEnabled: boolean;
  };

const DefaultSlashConfig = {
  /** Tally-style slashing */
  slasherFlavor: 'tally',
  /** Allow one round for vetoing */
  slashingExecutionDelayInRounds: 1,
  /** How long for a slash payload to be executed */
  slashingLifetimeInRounds: 5,
  /** Allow 2 rounds to discover faults */
  slashingOffsetInRounds: 2,
  /** No slash vetoer */
  slashingVetoer: EthAddress.ZERO,
  /** Use default disable duration */
  slashingDisableDuration: DefaultL1ContractsConfig.slashingDisableDuration,
  /** Use default slash amounts */
  slashAmountSmall: DefaultL1ContractsConfig.slashAmountSmall,
  slashAmountMedium: DefaultL1ContractsConfig.slashAmountMedium,
  slashAmountLarge: DefaultL1ContractsConfig.slashAmountLarge,

  // Slashing stuff
  slashMinPenaltyPercentage: 0.5,
  slashMaxPenaltyPercentage: 2.0,
  slashInactivityTargetPercentage: 0.7,
  slashInactivityConsecutiveEpochThreshold: 1,
  slashInactivityPenalty: DefaultL1ContractsConfig.slashAmountSmall,
  slashPrunePenalty: DefaultL1ContractsConfig.slashAmountSmall,
  slashDataWithholdingPenalty: DefaultL1ContractsConfig.slashAmountSmall,
  slashProposeInvalidAttestationsPenalty: DefaultL1ContractsConfig.slashAmountLarge,
  slashAttestDescendantOfInvalidPenalty: DefaultL1ContractsConfig.slashAmountLarge,
  slashUnknownPenalty: DefaultL1ContractsConfig.slashAmountSmall,
  slashBroadcastedInvalidBlockPenalty: DefaultL1ContractsConfig.slashAmountMedium,
  slashMaxPayloadSize: 50,
  slashGracePeriodL2Slots: 32 * 2, // Two epochs from genesis
  slashOffenseExpirationRounds: 8,
  sentinelEnabled: true,
} satisfies Partial<L2ChainConfig>;

export const stagingIgnitionL2ChainConfig: L2ChainConfig = {
  l1ChainId: 11155111,
  testAccounts: false,
  sponsoredFPC: false,
  p2pEnabled: true,
  p2pBootstrapNodes: [],
  registryAddress: '0xa2ed20f46dc58e5af6035ec61d463ac85a6d52d3',
  slashFactoryAddress: '0x2c03d596f4b5f0c1d0d2dbf92a5964dfc658763c',
  feeAssetHandlerAddress: '0x48be40187f2932bd14cd4d111fba26646da96c36',
  seqMinTxsPerBlock: 0,
  seqMaxTxsPerBlock: 0,
  realProofs: true,
  snapshotsUrl: 'https://storage.googleapis.com/aztec-testnet/snapshots/staging-ignition/',
  autoUpdate: 'config-and-version',
  autoUpdateUrl: 'https://storage.googleapis.com/aztec-testnet/auto-update/staging-ignition.json',
  maxTxPoolSize: 100_000_000, // 100MB
  publicIncludeMetrics,
  publicMetricsCollectorUrl: 'https://telemetry.alpha-testnet.aztec-labs.com/v1/metrics',
  publicMetricsCollectFrom: ['sequencer'],

  /** How many seconds an L1 slot lasts. */
  ethereumSlotDuration: 12,
  /** How many seconds an L2 slots lasts (must be multiple of ethereum slot duration). */
  aztecSlotDuration: 72,
  /** How many L2 slots an epoch lasts. */
  aztecEpochDuration: 32,
  /** The target validator committee size. */
  aztecTargetCommitteeSize: 24,
  /** The number of epochs to lag behind the current epoch for validator selection. */
  lagInEpochs: 2,
  /** The number of epochs after an epoch ends that proofs are still accepted. */
  aztecProofSubmissionEpochs: 1,
  /** How many sequencers must agree with a slash for it to be executed. */
  slashingQuorum: 65,

  slashingRoundSizeInEpochs: 4,
  slashingLifetimeInRounds: 40,
  slashingExecutionDelayInRounds: 28,
  slashAmountSmall: 2_000n * 10n ** 18n,
  slashAmountMedium: 10_000n * 10n ** 18n,
  slashAmountLarge: 50_000n * 10n ** 18n,
  slashingOffsetInRounds: 2,
  slasherFlavor: 'tally',
  slashingVetoer: EthAddress.ZERO, // TODO TMNT-329

  /** The mana target for the rollup */
  manaTarget: 0n,

  exitDelaySeconds: 5 * 24 * 60 * 60,

  /** The proving cost per mana */
  provingCostPerMana: 0n,
  localEjectionThreshold: 196_000n * 10n ** 18n,

  ejectionThreshold: 100_000n * 10n ** 18n,
  activationThreshold: 200_000n * 10n ** 18n,

  governanceProposerRoundSize: 300, // TODO TMNT-322
  governanceProposerQuorum: 151, // TODO TMNT-322

  // Node slashing config
  // TODO TMNT-330
  slashMinPenaltyPercentage: 0.5,
  slashMaxPenaltyPercentage: 2.0,
  slashInactivityTargetPercentage: 0.7,
  slashInactivityConsecutiveEpochThreshold: 2,
  slashInactivityPenalty: 2_000n * 10n ** 18n,
  slashPrunePenalty: 0n, // 2_000n * 10n ** 18n, We disable slashing for prune offenses right now
  slashDataWithholdingPenalty: 0n, // 2_000n * 10n ** 18n, We disable slashing for data withholding offenses right now
  slashProposeInvalidAttestationsPenalty: 50_000n * 10n ** 18n,
  slashAttestDescendantOfInvalidPenalty: 50_000n * 10n ** 18n,
  slashUnknownPenalty: 2_000n * 10n ** 18n,
  slashBroadcastedInvalidBlockPenalty: 10_000n * 10n ** 18n,
  slashMaxPayloadSize: 50,
  slashGracePeriodL2Slots: 32 * 4, // One round from genesis
  slashOffenseExpirationRounds: 8,
  sentinelEnabled: true,
  slashingDisableDuration: 5 * 24 * 60 * 60,
};

export const stagingPublicL2ChainConfig: L2ChainConfig = {
  l1ChainId: 11155111,
  testAccounts: false,
  sponsoredFPC: true,
  p2pEnabled: true,
  p2pBootstrapNodes: [],
  registryAddress: '0x2e48addca360da61e4d6c21ff2b1961af56eb83b',
  slashFactoryAddress: '0xe19410632fd00695bc5a08dd82044b7b26317742',
  feeAssetHandlerAddress: '0xb46dc3d91f849999330b6dd93473fa29fc45b076',
  seqMinTxsPerBlock: 0,
  seqMaxTxsPerBlock: 20,
  realProofs: true,
  snapshotsUrl: 'https://storage.googleapis.com/aztec-testnet/snapshots/staging-public/',
  autoUpdate: 'config-and-version',
  autoUpdateUrl: 'https://storage.googleapis.com/aztec-testnet/auto-update/staging-public.json',
  publicIncludeMetrics,
  publicMetricsCollectorUrl: 'https://telemetry.alpha-testnet.aztec-labs.com/v1/metrics',
  publicMetricsCollectFrom: ['sequencer'],
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
  /** The number of epochs to lag behind the current epoch for validator selection. */
  lagInEpochs: DefaultL1ContractsConfig.lagInEpochs,
  /** The local ejection threshold for a validator. Stricter than ejectionThreshold but local to a specific rollup */
  localEjectionThreshold: DefaultL1ContractsConfig.localEjectionThreshold,
  /** The number of epochs after an epoch ends that proofs are still accepted. */
  aztecProofSubmissionEpochs: 1,
  /** The deposit amount for a validator */
  activationThreshold: DefaultL1ContractsConfig.activationThreshold,
  /** The minimum stake for a validator. */
  ejectionThreshold: DefaultL1ContractsConfig.ejectionThreshold,
  /** The slashing round size */
  slashingRoundSizeInEpochs: DefaultL1ContractsConfig.slashingRoundSizeInEpochs,
  /** Governance proposing round size */
  governanceProposerRoundSize: DefaultL1ContractsConfig.governanceProposerRoundSize,
  /** The mana target for the rollup */
  manaTarget: DefaultL1ContractsConfig.manaTarget,
  /** The proving cost per mana */
  provingCostPerMana: DefaultL1ContractsConfig.provingCostPerMana,
  /** Exit delay for stakers */
  exitDelaySeconds: DefaultL1ContractsConfig.exitDelaySeconds,

  ...DefaultSlashConfig,
};

export const testnetL2ChainConfig: L2ChainConfig = {
  l1ChainId: 11155111,
  testAccounts: false,
  sponsoredFPC: true,
  p2pEnabled: true,
  p2pBootstrapNodes: [],
  registryAddress: '0xcfe61b2574984326679cd15c6566fbd4a724f3b4',
  slashFactoryAddress: '0x58dc5b14f9d3085c9106f5b8208a1026f94614f0',
  feeAssetHandlerAddress: '0x7abdec6e68ae27c37feb6a77371382a109ec4763',
  seqMinTxsPerBlock: 0,
  seqMaxTxsPerBlock: 20,
  realProofs: true,
  snapshotsUrl: 'https://storage.googleapis.com/aztec-testnet/snapshots/testnet/',
  autoUpdate: 'config-and-version',
  autoUpdateUrl: 'https://storage.googleapis.com/aztec-testnet/auto-update/testnet.json',
  maxTxPoolSize: 100_000_000, // 100MB
  publicIncludeMetrics,
  publicMetricsCollectorUrl: 'https://telemetry.alpha-testnet.aztec-labs.com/v1/metrics',
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
  /** The number of epochs to lag behind the current epoch for validator selection. */
  lagInEpochs: 2,
  /** The number of epochs after an epoch ends that proofs are still accepted. */
  aztecProofSubmissionEpochs: 1,
  /** The deposit amount for a validator */
  activationThreshold: DefaultL1ContractsConfig.activationThreshold,
  /** The minimum stake for a validator. */
  ejectionThreshold: DefaultL1ContractsConfig.ejectionThreshold,
  /** The local ejection threshold for a validator. Stricter than ejectionThreshold but local to a specific rollup */
  localEjectionThreshold: DefaultL1ContractsConfig.localEjectionThreshold,
  /** The slashing round size */
  slashingRoundSizeInEpochs: DefaultL1ContractsConfig.slashingRoundSizeInEpochs,
  /** Governance proposing round size */
  governanceProposerRoundSize: DefaultL1ContractsConfig.governanceProposerRoundSize,
  /** The mana target for the rollup */
  manaTarget: DefaultL1ContractsConfig.manaTarget,
  /** The proving cost per mana */
  provingCostPerMana: DefaultL1ContractsConfig.provingCostPerMana,
  /** Exit delay for stakers */
  exitDelaySeconds: DefaultL1ContractsConfig.exitDelaySeconds,

  ...DefaultSlashConfig,
  slashPrunePenalty: 0n,
  slashDataWithholdingPenalty: 0n,
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
  let config: L2ChainConfig | undefined;
  if (networkName === 'staging-public') {
    config = { ...stagingPublicL2ChainConfig };
  } else if (networkName === 'testnet') {
    config = { ...testnetL2ChainConfig };
  } else if (networkName === 'staging-ignition') {
    config = { ...stagingIgnitionL2ChainConfig };
  }
  if (!config) {
    return undefined;
  }
  // If the bootnodes are not set, get them from the network
  const bootnodeKey: EnvVar = 'BOOTSTRAP_NODES';
  if (!process.env[bootnodeKey]) {
    config.p2pBootstrapNodes = await getBootnodes(networkName, cacheDir);
  }
  return config;
}

function enrichVar(envVar: EnvVar, value: string | undefined) {
  // Don't override
  if (process.env[envVar] || value === undefined) {
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
  return path.join(process.env.HOME || '~', '.aztec', networkName, 'data');
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
  enrichVar('AZTEC_LOCAL_EJECTION_THRESHOLD', config.localEjectionThreshold.toString());
  enrichVar('AZTEC_SLASHING_QUORUM', config.slashingQuorum?.toString());
  enrichVar('AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS', config.slashingRoundSizeInEpochs.toString());
  enrichVar('AZTEC_GOVERNANCE_PROPOSER_QUORUM', config.governanceProposerQuorum?.toString());
  enrichVar('AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE', config.governanceProposerRoundSize.toString());
  enrichVar('AZTEC_MANA_TARGET', config.manaTarget.toString());
  enrichVar('AZTEC_PROVING_COST_PER_MANA', config.provingCostPerMana.toString());
  enrichVar('AZTEC_SLASH_AMOUNT_SMALL', config.slashAmountSmall.toString());
  enrichVar('AZTEC_SLASH_AMOUNT_MEDIUM', config.slashAmountMedium.toString());
  enrichVar('AZTEC_SLASH_AMOUNT_LARGE', config.slashAmountLarge.toString());
  enrichVar('AZTEC_SLASHING_LIFETIME_IN_ROUNDS', config.slashingLifetimeInRounds.toString());
  enrichVar('AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS', config.slashingExecutionDelayInRounds.toString());
  enrichVar('AZTEC_SLASHING_OFFSET_IN_ROUNDS', config.slashingOffsetInRounds.toString());
  enrichVar('AZTEC_SLASHER_FLAVOR', config.slasherFlavor);
  enrichVar('AZTEC_EXIT_DELAY_SECONDS', config.exitDelaySeconds.toString());
  enrichEthAddressVar('AZTEC_SLASHING_VETOER', config.slashingVetoer.toString());

  // Slashing
  enrichVar('SLASH_MIN_PENALTY_PERCENTAGE', config.slashMinPenaltyPercentage.toString());
  enrichVar('SLASH_MAX_PENALTY_PERCENTAGE', config.slashMaxPenaltyPercentage.toString());
  enrichVar('SLASH_PRUNE_PENALTY', config.slashPrunePenalty.toString());
  enrichVar('SLASH_DATA_WITHHOLDING_PENALTY', config.slashDataWithholdingPenalty.toString());
  enrichVar('SLASH_INACTIVITY_TARGET_PERCENTAGE', config.slashInactivityTargetPercentage.toString());
  enrichVar('SLASH_INACTIVITY_CONSECUTIVE_EPOCH_THRESHOLD', config.slashInactivityConsecutiveEpochThreshold.toString());
  enrichVar('SLASH_INACTIVITY_PENALTY', config.slashInactivityPenalty.toString());
  enrichVar('SLASH_PROPOSE_INVALID_ATTESTATIONS_PENALTY', config.slashProposeInvalidAttestationsPenalty.toString());
  enrichVar('SLASH_ATTEST_DESCENDANT_OF_INVALID_PENALTY', config.slashAttestDescendantOfInvalidPenalty.toString());
  enrichVar('SLASH_UNKNOWN_PENALTY', config.slashUnknownPenalty.toString());
  enrichVar('SLASH_INVALID_BLOCK_PENALTY', config.slashBroadcastedInvalidBlockPenalty.toString());
  enrichVar('SLASH_OFFENSE_EXPIRATION_ROUNDS', config.slashOffenseExpirationRounds.toString());
  enrichVar('SLASH_MAX_PAYLOAD_SIZE', config.slashMaxPayloadSize.toString());

  enrichVar('SENTINEL_ENABLED', config.sentinelEnabled.toString());
}
