import type { LogFn } from '@aztec/foundation/log';
import { type ChainConfig, emptyChainConfig } from '@aztec/stdlib/config';
import type { ComponentsVersions } from '@aztec/stdlib/versioning';

import { ENR, SignableENR } from '@chainsafe/enr';
import type { PeerId } from '@libp2p/interface';
import { type Multiaddr, multiaddr } from '@multiformats/multiaddr';

import { AZTEC_ENR_CLIENT_VERSION_KEY, AZTEC_ENR_KEY } from '../types/index.js';
import { convertToMultiaddr, createLibP2PPeerIdFromPrivateKey } from '../util.js';
import { setAztecClientVersionEnrKey, setAztecEnrKey } from '../versioning.js';

export { ENR };

export async function createBootnodeENRandPeerId(
  privateKey: string,
  p2pIp: string,
  p2pBroadcastPort: number,
  l1ChainId: number,
): Promise<{ enr: SignableENR; peerId: PeerId }> {
  const peerId = await createLibP2PPeerIdFromPrivateKey(privateKey);
  const enr = SignableENR.createFromPeerId(peerId);
  const publicAddr = multiaddr(convertToMultiaddr(p2pIp, p2pBroadcastPort, 'udp'));
  enr.setLocationMultiaddr(publicAddr);

  const config: ChainConfig = {
    ...emptyChainConfig,
    l1ChainId,
  };

  setAztecEnrKey(enr, config);
  return { enr, peerId };
}

export function createNodeENR(
  peerId: PeerId,
  multiAddrUdp: Multiaddr | undefined,
  multiAddrTcp: Multiaddr | undefined,
  chainConfig: ChainConfig,
  packageVersion: string,
): { enr: SignableENR; versions: ComponentsVersions } {
  // create ENR from PeerId
  const enr = SignableENR.createFromPeerId(peerId);
  // Add aztec identification to ENR
  const versions = setAztecEnrKey(enr, chainConfig);
  // Add aztec client version to ENR
  setAztecClientVersionEnrKey(enr, packageVersion);

  // set location multiaddr in ENR record
  if (multiAddrUdp) {
    enr.setLocationMultiaddr(multiAddrUdp);
  }
  if (multiAddrTcp) {
    enr.setLocationMultiaddr(multiAddrTcp);
  }

  return { enr, versions };
}

export async function printENR(enr: string, log: LogFn) {
  const decoded = ENR.decodeTxt(enr);
  log(`PeerID: ${await decoded.peerId()}`);
  log(`IP: ${decoded.ip}`);
  log(`UDP: ${decoded.udp}`);
  log(`TCP: ${decoded.tcp}`);

  const aztec = decoded.kvs.get(AZTEC_ENR_KEY);
  log(`Aztec version: ${aztec?.toString()}`);

  const aztecClientVersion = decoded.kvs.get(AZTEC_ENR_CLIENT_VERSION_KEY);
  log(`Aztec client version ${aztecClientVersion ? aztecClientVersion!.toString() : 'N/A'}`);
}
