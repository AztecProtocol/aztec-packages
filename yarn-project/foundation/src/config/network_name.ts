export type NetworkNames =
  | 'local'
  | 'staging'
  | 'testnet'
  | 'mainnet'
  | 'next-net'
  | 'devnet'
  | `v${number}-devnet-${number}`;

export function getActiveNetworkName(name?: string): NetworkNames {
  const network = name || process.env.NETWORK;
  if (!network || network === '' || network === 'local') {
    return 'local';
  } else if (network === 'staging') {
    return network;
  } else if (network === 'testnet' || network === 'alpha-testnet') {
    return 'testnet';
  } else if (network === 'mainnet') {
    return 'mainnet';
  } else if (network === 'next-net') {
    return 'next-net';
  } else if (network === 'devnet') {
    return 'devnet';
  } else if (/^v\d+-devnet-\d+$/.test(network)) {
    return network as `v${number}-devnet-${number}`;
  }
  throw new Error(`Unknown network: ${network}`);
}
