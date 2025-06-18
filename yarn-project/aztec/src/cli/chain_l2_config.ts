import { EthAddress } from '@aztec/aztec.js';
import type { EnvVar } from '@aztec/foundation/config';
import type { SharedNodeConfig } from '@aztec/node-lib/config';

import path from 'path';

export type NetworkNames = 'testnet-ignition' | 'alpha-testnet';

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

export async function getL2ChainConfig(networkName: NetworkNames): Promise<L2ChainConfig | undefined> {
  if (networkName === 'testnet-ignition') {
    const config = { ...testnetIgnitionL2ChainConfig };
    config.p2pBootstrapNodes = await getBootnodes(networkName);
    return config;
  } else if (networkName === 'alpha-testnet') {
    const config = { ...alphaTestnetL2ChainConfig };
    config.p2pBootstrapNodes = await getBootnodes(networkName);
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

export async function enrichEnvironmentWithChainConfig(networkName: NetworkNames) {
  const config = await getL2ChainConfig(networkName);
  if (!config) {
    throw new Error(`Unknown network name: ${networkName}`);
  }
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
  enrichVar('DATA_DIRECTORY', path.join(process.env.HOME || '~', '.aztec', networkName, 'data'));
  enrichVar('PROVER_REAL_PROOFS', config.realProofs.toString());
  enrichVar('PXE_PROVER_ENABLED', config.realProofs.toString());
  enrichVar('SYNC_SNAPSHOTS_URL', config.snapshotsUrl);

  if (config.autoUpdate) {
    enrichVar('AUTO_UPDATE', config.autoUpdate?.toString());
  }

  if (config.autoUpdateUrl) {
    enrichVar('AUTO_UPDATE_URL', config.autoUpdateUrl);
  }

  enrichEthAddressVar('REGISTRY_CONTRACT_ADDRESS', config.registryAddress);
  enrichEthAddressVar('SLASH_FACTORY_CONTRACT_ADDRESS', config.slashFactoryAddress);
  enrichEthAddressVar('FEE_ASSET_HANDLER_CONTRACT_ADDRESS', config.feeAssetHandlerAddress);
}
