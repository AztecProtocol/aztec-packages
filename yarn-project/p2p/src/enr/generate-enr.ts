import { type ChainConfig, emptyChainConfig } from '@aztec/circuit-types/config';
import type { LogFn } from '@aztec/foundation/log';

import { ENR, SignableENR } from '@chainsafe/enr';
import { multiaddr } from '@multiformats/multiaddr';

import { AZTEC_ENR_KEY } from '../types/index.js';
import { convertToMultiaddr, createLibP2PPeerIdFromPrivateKey } from '../util.js';
import { setAztecEnrKey } from '../versioning.js';

export async function createBootnodeENR(
  privateKey: string,
  udpAnnounceAddress: string,
  l1ChainId: number,
): Promise<SignableENR> {
  const peerId = await createLibP2PPeerIdFromPrivateKey(privateKey);
  const enr = SignableENR.createFromPeerId(peerId);
  const publicAddr = multiaddr(convertToMultiaddr(udpAnnounceAddress, 'udp'));
  enr.setLocationMultiaddr(publicAddr);

  const config: ChainConfig = {
    ...emptyChainConfig,
    l1ChainId,
  };

  setAztecEnrKey(enr, config);
  return enr;
}

export async function printENR(enr: string, log: LogFn) {
  const decoded = ENR.decodeTxt(enr);
  log(`PeerID: ${await decoded.peerId()}`);
  log(`IP: ${decoded.ip}`);
  log(`UDP: ${decoded.udp}`);
  log(`TCP: ${decoded.tcp}`);
  const aztec = decoded.kvs.get(AZTEC_ENR_KEY);
  log(`Aztec version: ${aztec?.toString()}`);
}
