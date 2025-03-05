export type NetworkNames = 'testnet-ignition';

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
};

export async function getBootnodes(networkName: NetworkNames) {
  const url = `http://static.aztec.network/${networkName}/bootnodes.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch basic contract addresses from ${url}`);
  }
  const json = await response.json();
  return json['bootnodes'];
}

export async function getL2ChainConfig(networkName: NetworkNames): Promise<L2ChainConfig | undefined> {
  if (networkName === 'testnet-ignition') {
    const config = { ...testnetIgnitionL2ChainConfig };
    config.p2pBootstrapNodes = await getBootnodes(networkName);
    return config;
  }
  return undefined;
}

export async function enrichEnvironmentWithChainConfig(networkName: NetworkNames) {
  const config = await getL2ChainConfig(networkName);
  if (!config) {
    throw new Error(`Unknown network name: ${networkName}`);
  }
  process.env['ETHEREUM_SLOT_DURATION'] = config.ethereumSlotDuration.toString();
  process.env['AZTEC_SLOT_DURATION'] = config.aztecSlotDuration.toString();
  process.env['AZTEC_EPOCH_DURATION'] = config.aztecEpochDuration.toString();
  process.env['AZTEC_PROOF_SUBMISSION_WINDOW'] = config.aztecProofSubmissionWindow.toString();
  process.env['P2P_BOOTSTRAP_NODES'] = config.p2pBootstrapNodes.join(',');
  process.env['TEST_ACCOUNTS'] = config.testAccounts.toString();
  process.env['P2P_ENABLED'] = config.p2pEnabled.toString();
  process.env['L1_CHAIN_ID'] = config.l1ChainId.toString();
  process.env['REGISTRY_CONTRACT_ADDRESS'] = config.registryAddress;
}
