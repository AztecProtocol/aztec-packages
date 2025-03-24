import type { EnvVar } from '@aztec/foundation/config';

import path from 'path';

export type NetworkNames = 'testnet-ignition' | 'alpha-testnet';

export type L2ChainConfig = {
  l1ChainId: number;
  ethereumSlotDuration: number;
  aztecSlotDuration: number;
  aztecEpochDuration: number;
  aztecProofSubmissionWindow: number;
  testAccounts: boolean;
  p2pEnabled: boolean;
  p2pBootstrapNodes: string[];
  registryAddress: string;
  seqMinTxsPerBlock: number;
  seqMaxTxsPerBlock: number;
  realProofs: boolean;
};

export const testnetIgnitionL2ChainConfig: L2ChainConfig = {
  l1ChainId: 11155111,
  ethereumSlotDuration: 12,
  aztecSlotDuration: 36,
  aztecEpochDuration: 32,
  aztecProofSubmissionWindow: 64,
  testAccounts: true,
  p2pEnabled: true,
  p2pBootstrapNodes: [],
  registryAddress: '0x12b3ebc176a1646b911391eab3760764f2e05fe3',
  seqMinTxsPerBlock: 0,
  seqMaxTxsPerBlock: 0,
  realProofs: true,
};

export const alphaTestnetL2ChainConfig: L2ChainConfig = {
  l1ChainId: 11155111,
  ethereumSlotDuration: 12,
  aztecSlotDuration: 36,
  aztecEpochDuration: 32,
  aztecProofSubmissionWindow: 64,
  testAccounts: false,
  p2pEnabled: true,
  p2pBootstrapNodes: [],
  registryAddress: '', // To be updated
  seqMinTxsPerBlock: 0,
  seqMaxTxsPerBlock: 4,
  realProofs: true,
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

export async function enrichEnvironmentWithChainConfig(networkName: NetworkNames) {
  const config = await getL2ChainConfig(networkName);
  if (!config) {
    throw new Error(`Unknown network name: ${networkName}`);
  }
  enrichVar('ETHEREUM_SLOT_DURATION', config.ethereumSlotDuration.toString());
  enrichVar('AZTEC_SLOT_DURATION', config.aztecSlotDuration.toString());
  enrichVar('AZTEC_EPOCH_DURATION', config.aztecEpochDuration.toString());
  enrichVar('AZTEC_PROOF_SUBMISSION_WINDOW', config.aztecProofSubmissionWindow.toString());
  enrichVar('BOOTSTRAP_NODES', config.p2pBootstrapNodes.join(','));
  enrichVar('TEST_ACCOUNTS', config.testAccounts.toString());
  enrichVar('P2P_ENABLED', config.p2pEnabled.toString());
  enrichVar('L1_CHAIN_ID', config.l1ChainId.toString());
  enrichVar('REGISTRY_CONTRACT_ADDRESS', config.registryAddress);
  enrichVar('SEQ_MIN_TX_PER_BLOCK', config.seqMinTxsPerBlock.toString());
  enrichVar('SEQ_MAX_TX_PER_BLOCK', config.seqMaxTxsPerBlock.toString());
  enrichVar('DATA_DIRECTORY', path.join(process.env.HOME || '~', '.aztec', networkName, 'data'));
  enrichVar('PROVER_REAL_PROOFS', config.realProofs.toString());
  enrichVar('PXE_PROVER_ENABLED', config.realProofs.toString());
}
