import type { ChainConfig } from '@aztec/stdlib/config';

import { SignableENR } from '@chainsafe/enr';
import { multiaddr } from '@multiformats/multiaddr';

import { convertToMultiaddr, createLibP2PPeerIdFromPrivateKey } from '../util.js';
import { setAztecEnrKey } from '../versioning.js';

/**
 * Make a list of ENRs for a given list of p2p private keys and ports
 * @param p2pPrivateKeys - The private keys of the p2p nodes
 * @param ports - The ports of the p2p nodes
 * @returns A list of ENRs
 */
export async function makeEnrs(p2pPrivateKeys: string[], ports: number[], config: ChainConfig) {
  return await Promise.all(
    p2pPrivateKeys.map((pk, i) => {
      return makeEnr(pk, ports[i], config);
    }),
  );
}

/**
 * Make an ENR for a given p2p private key and port
 * @param p2pPrivateKey - The private key of the p2p node
 * @param port - The port of the p2p node
 * @returns The ENR of the p2p node
 */
export async function makeEnr(p2pPrivateKey: string, port: number, config: ChainConfig) {
  const peerId = await createLibP2PPeerIdFromPrivateKey(p2pPrivateKey);
  const enr = SignableENR.createFromPeerId(peerId);

  const p2pIp = `127.0.0.1`;
  const udpPublicAddr = multiaddr(convertToMultiaddr(p2pIp, port, 'udp'));
  const tcpPublicAddr = multiaddr(convertToMultiaddr(p2pIp, port, 'tcp'));

  // ENRS must include the network and a discoverable address (udp for discv5)
  setAztecEnrKey(enr, config);
  enr.setLocationMultiaddr(udpPublicAddr);
  enr.setLocationMultiaddr(tcpPublicAddr);

  return enr.encodeTxt();
}
