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
      version: 'alpha-testnet',
      address: AztecAddress.fromString('0x0b27e30667202907fc700d50e9bc816be42f8141fae8b9f2281873dbdb9fc2e5'),
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
