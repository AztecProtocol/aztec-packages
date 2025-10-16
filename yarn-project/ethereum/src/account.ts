import { privateKeyToAccount } from 'viem/accounts';

export function getAddressFromPrivateKey(privateKey: `0x${string}`): `0x${string}` {
  return privateKeyToAccount(privateKey).address;
}
