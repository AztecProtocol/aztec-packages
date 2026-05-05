import type { ChainConfig } from '@aztec/stdlib/config';

import { SignableENR } from '@chainsafe/enr';
import type { PrivateKey } from '@libp2p/interface';
import { multiaddr } from '@multiformats/multiaddr';

import { convertToMultiaddr, privateKeyFromHex } from '../util.js';
import { setAztecEnrKey } from '../versioning.js';

/**
 * Make a list of ENRs for a given list of p2p private keys and ports
 * @param p2pPrivateKeys - The private keys of the p2p nodes (hex strings)
 * @param ports - The ports of the p2p nodes
 * @returns A list of ENRs
 */
export function makeEnrs(p2pPrivateKeys: string[], ports: number[], config: ChainConfig) {
  return p2pPrivateKeys.map((pk, i) => makeEnr(pk, ports[i], config));
}

/**
 * Make an ENR for a given p2p private key and port
 * @param p2pPrivateKey - The private key of the p2p node (hex string or PrivateKey object)
 * @param port - The port of the p2p node
 * @returns The ENR of the p2p node
 */
export function makeEnr(p2pPrivateKey: string | PrivateKey, port: number, config: ChainConfig) {
  const libp2pPrivateKey = typeof p2pPrivateKey === 'string' ? privateKeyFromHex(p2pPrivateKey) : p2pPrivateKey;
  const enr = SignableENR.createFromPrivateKey(libp2pPrivateKey);

  const p2pIp = `127.0.0.1`;
  const udpPublicAddr = multiaddr(convertToMultiaddr(p2pIp, port, 'udp'));
  const tcpPublicAddr = multiaddr(convertToMultiaddr(p2pIp, port, 'tcp'));

  // ENRS must include the network and a discoverable address (udp for discv5)
  setAztecEnrKey(enr, config);
  enr.setLocationMultiaddr(udpPublicAddr);
  enr.setLocationMultiaddr(tcpPublicAddr);

  return enr.encodeTxt();
}
