export type NetworkNames =
  | 'local'
  | 'staging-ignition'
  | 'staging-public'
  | 'testnet'
  | 'mainnet'
  | 'next-net'
  | 'devnet';

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
  } else if (network === 'mainnet') {
    return 'mainnet';
  } else if (network === 'next-net') {
    return 'next-net';
  } else if (network === 'devnet') {
    return 'devnet';
  }
  throw new Error(`Unknown network: ${network}`);
}
