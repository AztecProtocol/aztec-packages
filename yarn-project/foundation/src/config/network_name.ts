export type NetworkNames = 'local' | 'staging-ignition' | 'staging-public' | 'testnet' | 'ignition' | 'next-net';

export function getActiveNetworkName(name?: string): NetworkNames {
  const network = name || process.env.NETWORK;
  if (!network || network === '' || network === 'local') {
    return 'local';
  } else if (network === 'staging-ignition') {
    return network;
  } else if (network === 'staging-public') {
    return network;
  } else if (network === 'testnet' || network === 'alpha-testnet') {
    return 'testnet';
  } else if (network === 'ignition') {
    return 'ignition';
  } else if (network === 'next-net') {
    return 'next-net';
  }
  throw new Error(`Unknown network: ${network}`);
}
