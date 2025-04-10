export type Network = { nodeURL: string; name: string; description: string };

export const NETWORKS: Network[] = [
  {
    nodeURL: 'http://104.198.9.16:8080/',
    name: 'Aztec Devnet',
    description: 'Public development network',
  },
  {
    nodeURL: 'http://localhost:8080',
    name: 'Local Sandbox',
    description: 'Run your own sandbox',
  },
];
