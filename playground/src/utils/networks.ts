import { AztecAddress } from '@aztec/aztec.js/addresses';
import { VERSION } from './constants';

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
    nodeURL: 'https://devnet.aztec-labs.com',
    name: 'Aztec Devnet',
    description: 'Public development network',
    hasTestAccounts: true,
    hasSponsoredFPC: true,
    version: '3.0.0-devnet.2',
    sponsoredFPC: {
      version: '3.0.0-devnet.2',
      address: AztecAddress.fromString('0x280e5686a148059543f4d0968f9a18cd4992520fcd887444b8689bf2726a1f97'),
    },
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
