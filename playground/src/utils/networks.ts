import { AztecAddress } from '@aztec/aztec.js';
import { VERSION } from './constants';

export type Network = {
  nodeURL: string;
  name: string;
  description: string;
  hasTestAccounts: boolean;
  hasSponsoredFPC: boolean;
  sponsoredFPC?: {
    version: string;
    address: AztecAddress;
  };
};

export const NETWORKS: Network[] = [
  {
    nodeURL: 'https://35.182.93.169:443',
    name: 'Aztec Testnet',
    description: 'Public testnet',
    hasTestAccounts: false,
    hasSponsoredFPC: true,
    sponsoredFPC: {
      version: '0.85.0-alpha-testnet.2',
      address: AztecAddress.fromString('0x042a1059a654dd542c33d7a2ec3f5d96f88da393b99a594b2b3e9f919def5101'),
    },
  },
  {
    nodeURL: 'http://34.169.170.55:8080',
    name: 'Aztec Devnet',
    description: 'Public development network',
    hasTestAccounts: false,
    hasSponsoredFPC: true,
  },
  {
    nodeURL: 'http://localhost:8080',
    name: 'Local Sandbox',
    description: `Run your own sandbox (v${VERSION})`,
    hasTestAccounts: true,
    hasSponsoredFPC: true,
  },
];
