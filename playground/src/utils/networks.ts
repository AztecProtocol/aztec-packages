import { VERSION } from './constants';
import { AztecAddress } from '@aztec/aztec.js';

export type Network = {
  nodeURL: string;
  name: string;
  description: string;
  hasTestAccounts: boolean;
  hasSponsoredFPC: boolean;
  version?: string;
  sponsoredFPC?: {
    version?: string;
    address: AztecAddress;
  };
  transactionCongestionThreshold?: number;
};

export const NETWORKS: Network[] = [
  {
    nodeURL: 'https://rpc.testnet.aztec.network',
    name: 'Aztec Testnet',
    description: 'Public testnet',
    hasTestAccounts: false,
    hasSponsoredFPC: true,
    version: '1.1.2',
    sponsoredFPC: {
      version: '1.1.2',
      address: AztecAddress.fromString('0x19b5539ca1b104d4c3705de94e4555c9630def411f025e023a13189d0c56f8f2'),
    },
    transactionCongestionThreshold: 40,
  },
  {
    nodeURL: 'http://34.169.170.55:8080',
    name: 'Aztec Devnet',
    description: 'Public development network',
    hasTestAccounts: false,
    hasSponsoredFPC: true,
    version: '0.85.0',
  },
  {
    nodeURL: 'http://localhost:8080',
    name: 'Local Sandbox',
    description: `Run your own sandbox (v${VERSION})`,
    hasTestAccounts: true,
    hasSponsoredFPC: true,
    version: VERSION,
  },
];
