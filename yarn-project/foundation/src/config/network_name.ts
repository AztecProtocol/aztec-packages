export type NetworkNames = 'local' | 'testnet-ignition' | 'alpha-testnet' | 'testnet';

export function getActiveNetworkName(name?: string): NetworkNames {
  const network = name || process.env.NETWORK;
  if (!network || network === '' || network === 'local') {
    return 'local';
  } else if (network === 'testnet-ignition') {
    return network;
  } else if (network === 'alpha-testnet' || network === 'testnet') {
    return network;
  }
  throw new Error(`Unknown network: ${network}`);
}
