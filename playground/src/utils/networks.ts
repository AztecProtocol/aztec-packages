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
    nodeURL: 'http://35.185.246.191:8080 ',
    name: 'Aztec Masternet',
    description: 'Latest and greatest',
    hasTestAccounts: false,
    hasSponsoredFPC: true,
    version: VERSION,
  },
  {
    nodeURL: 'https://full-node.alpha-testnet.aztec.network',
    name: 'Aztec Testnet',
    description: 'Public testnet',
    hasTestAccounts: false,
    hasSponsoredFPC: true,
    version: '0.85.0-alpha-testnet.4',
    sponsoredFPC: {
      version: '0.85.0-alpha-testnet.2',
      address: AztecAddress.fromString('0x0b27e30667202907fc700d50e9bc816be42f8141fae8b9f2281873dbdb9fc2e5'),
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
