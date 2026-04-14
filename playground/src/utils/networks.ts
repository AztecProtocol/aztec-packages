import { AztecAddress } from '@aztec/aztec.js/addresses';
import { VERSION } from './constants';

export type Network = {
  nodeURL: string;
  name: string;
  description: string;
  hasTestAccounts: boolean;
  hasSponsoredFPC: boolean;
  nodeVersion?: string;
  sponsoredFPC?: {
    version?: string;
    address: AztecAddress;
  };
  chainId: number;
  version: number;
  transactionCongestionThreshold?: number;
};

export const NETWORKS: Network[] = [
  {
    nodeURL: 'http://localhost:8080',
    name: 'Local Network',
    description: `Run your own local network (v${VERSION})`,
    chainId: 31337,
    version: 0,
    hasTestAccounts: true,
    hasSponsoredFPC: true,
    nodeVersion: VERSION,
  },
];
