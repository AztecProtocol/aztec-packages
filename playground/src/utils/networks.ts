export type Network = {
  nodeURL: string;
  name: string;
  description: string;
  hasTestAccounts: boolean;
  hasSponsoredFPC: boolean;
};

export const NETWORKS: Network[] = [
  {
    nodeURL: 'http://104.198.9.75:8080',
    name: 'Aztec Devnet',
    description: 'Public development network',
    hasTestAccounts: false,
    hasSponsoredFPC: true,
  },
  {
    nodeURL: 'http://localhost:8080',
    name: 'Local Sandbox',
    description: 'Run your own sandbox',
    hasTestAccounts: true,
    hasSponsoredFPC: true,
  },
];
