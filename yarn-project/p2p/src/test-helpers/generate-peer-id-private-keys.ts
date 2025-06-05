import type { PrivateKey } from '@libp2p/interface';
import { generatePrivateKey } from 'viem/accounts';

import { privateKeyFromHex } from '../util.js';

/**
 * Generate a list of peer id private keys
 * @param numberOfPeers - The number of peer id private keys to generate
 * @returns A list of peer id private keys
 */
export function generatePeerIdPrivateKeys(numberOfPeers: number): PrivateKey[] {
  const peerIdPrivateKeys: string[] = [];
  for (let i = 0; i < numberOfPeers; i++) {
    // magic number is multiaddr prefix: https://multiformats.io/multiaddr/
    peerIdPrivateKeys.push('08021220' + generatePrivateKey().slice(2, 68));
  }
  return peerIdPrivateKeys.map(privateKeyFromHex);
}
