import { EthAddress } from '@aztec/aztec.js';
import type { EnvVar, NetworkNames } from '@aztec/foundation/config';
import type { SharedNodeConfig } from '@aztec/node-lib/config';

import path from 'path';

import publicIncludeMetrics from '../../public_include_metric_prefixes.json' with { type: 'json' };

export type L2ChainConfig = {
  l1ChainId: number;
  ethereumSlotDuration: number;
  aztecSlotDuration: number;
  aztecEpochDuration: number;
  aztecProofSubmissionEpochs: number;
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

  // slashing stuff
  slashPayloadTtlSeconds: number;
  slashPruneEnabled: boolean;
  slashPrunePenalty: number;
  slashPruneMaxPenalty: number;
  slashInactivityEnabled: boolean;
  slashInactivityCreateTargetPercentage: number;
  slashInactivitySignalTargetPercentage: number;
  slashInactivityCreatePenalty: number;
  slashInvalidBlockEnabled: boolean;
  slashInvalidBlockPenalty: number;
  slashInvalidBlockMaxPenalty: number;
};

export const testnetIgnitionL2ChainConfig: L2ChainConfig = {
  l1ChainId: 11155111,
  ethereumSlotDuration: 12,
  aztecSlotDuration: 36,
  aztecEpochDuration: 32,
  aztecProofSubmissionEpochs: 1,
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

  // slashing stuff
  slashInactivityEnabled: false,
  slashInactivityCreateTargetPercentage: 0,
  slashInactivitySignalTargetPercentage: 0,
  slashInactivityCreatePenalty: 0,
  slashInvalidBlockEnabled: false,
  slashPayloadTtlSeconds: 0,
  slashPruneEnabled: false,
  slashPrunePenalty: 0,
  slashPruneMaxPenalty: 0,
  slashInvalidBlockPenalty: 0,
  slashInvalidBlockMaxPenalty: 0,
};

export const alphaTestnetL2ChainConfig: L2ChainConfig = {
  l1ChainId: 11155111,
  ethereumSlotDuration: 12,
  aztecSlotDuration: 36,
  aztecEpochDuration: 32,
  aztecProofSubmissionEpochs: 1,
  testAccounts: false,
  sponsoredFPC: true,
  p2pEnabled: true,
  p2pBootstrapNodes: [],
  registryAddress: '0x4d2cc1d5fb6be65240e0bfc8154243e69c0fb19e',
  slashFactoryAddress: '0x3c9ccf55a8ac3c2eeedf2ee2aa1722188fd676be',
  feeAssetHandlerAddress: '0x80d848dc9f52df56789e2d62ce66f19555ff1019',
  seqMinTxsPerBlock: 0,
  seqMaxTxsPerBlock: 20,
  realProofs: true,
  snapshotsUrl: 'https://storage.googleapis.com/aztec-testnet/snapshots/',
  autoUpdate: 'config-and-version',
  autoUpdateUrl: 'https://storage.googleapis.com/aztec-testnet/auto-update/alpha-testnet.json',
  maxTxPoolSize: 100_000_000, // 100MB
  publicIncludeMetrics,
  publicMetricsCollectorUrl: 'https://telemetry.alpha-testnet.aztec.network',
  publicMetricsCollectFrom: ['sequencer'],

  // slashing stuff
  slashPayloadTtlSeconds: 36 * 32 * 24, // 24 epochs
  slashPruneEnabled: true,
  slashPrunePenalty: 17,
  slashPruneMaxPenalty: 17,
  slashInactivityEnabled: true,
  slashInactivityCreateTargetPercentage: 100,
  slashInactivitySignalTargetPercentage: 100,
  slashInactivityCreatePenalty: 17,
  slashInvalidBlockEnabled: true,
  slashInvalidBlockPenalty: 100,
  slashInvalidBlockMaxPenalty: 100,
};

export async function getBootnodes(networkName: NetworkNames) {
  const url = `http://static.aztec.network/${networkName}/bootnodes.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch basic contract addresses from ${url}. Check you are using a correct network name.`,
    );
  }
  const json = await response.json();

  return json['bootnodes'];
}

export async function getL2ChainConfig(
  networkName: NetworkNames,
): Promise<{ config: L2ChainConfig; networkName: string } | undefined> {
  if (networkName === 'testnet-ignition') {
    const config = { ...testnetIgnitionL2ChainConfig };
    config.p2pBootstrapNodes = await getBootnodes(networkName);
    return { config, networkName };
  } else if (networkName === 'alpha-testnet' || networkName === 'testnet') {
    const config = { ...alphaTestnetL2ChainConfig };
    config.p2pBootstrapNodes = await getBootnodes('alpha-testnet');
    return { config, networkName: 'alpha-testnet' };
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

export async function enrichEnvironmentWithChainConfig(networkName: NetworkNames) {
  if (networkName === 'local') {
    return;
  }

  const result = await getL2ChainConfig(networkName);
  if (!result) {
    throw new Error(`Unknown network name: ${networkName}`);
  }
  const { config, networkName: name } = result;
  enrichVar('ETHEREUM_SLOT_DURATION', config.ethereumSlotDuration.toString());
  enrichVar('AZTEC_SLOT_DURATION', config.aztecSlotDuration.toString());
  enrichVar('AZTEC_EPOCH_DURATION', config.aztecEpochDuration.toString());
  enrichVar('AZTEC_PROOF_SUBMISSION_EPOCHS', config.aztecProofSubmissionEpochs.toString());
  enrichVar('BOOTSTRAP_NODES', config.p2pBootstrapNodes.join(','));
  enrichVar('TEST_ACCOUNTS', config.testAccounts.toString());
  enrichVar('SPONSORED_FPC', config.sponsoredFPC.toString());
  enrichVar('P2P_ENABLED', config.p2pEnabled.toString());
  enrichVar('L1_CHAIN_ID', config.l1ChainId.toString());
  enrichVar('SEQ_MIN_TX_PER_BLOCK', config.seqMinTxsPerBlock.toString());
  enrichVar('SEQ_MAX_TX_PER_BLOCK', config.seqMaxTxsPerBlock.toString());
  enrichVar('DATA_DIRECTORY', path.join(process.env.HOME || '~', '.aztec', name, 'data'));
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

  // Slashing
  enrichVar('SLASH_PAYLOAD_TTL_SECONDS', config.slashPayloadTtlSeconds.toString());
  enrichVar('SLASH_PRUNE_ENABLED', config.slashPruneEnabled.toString());
  enrichVar('SLASH_PRUNE_PENALTY', config.slashPrunePenalty.toString());
  enrichVar('SLASH_PRUNE_MAX_PENALTY', config.slashPruneMaxPenalty.toString());
  enrichVar('SLASH_INACTIVITY_ENABLED', config.slashInactivityEnabled.toString());
  enrichVar('SLASH_INACTIVITY_CREATE_TARGET_PERCENTAGE', config.slashInactivityCreateTargetPercentage.toString());
  enrichVar('SLASH_INACTIVITY_SIGNAL_TARGET_PERCENTAGE', config.slashInactivitySignalTargetPercentage.toString());
  enrichVar('SLASH_INACTIVITY_CREATE_PENALTY', config.slashInactivityCreatePenalty.toString());
  enrichVar('SLASH_INVALID_BLOCK_ENABLED', config.slashInvalidBlockEnabled.toString());
  enrichVar('SLASH_INVALID_BLOCK_PENALTY', config.slashInvalidBlockPenalty.toString());
  enrichVar('SLASH_INVALID_BLOCK_MAX_PENALTY', config.slashInvalidBlockMaxPenalty.toString());
}
