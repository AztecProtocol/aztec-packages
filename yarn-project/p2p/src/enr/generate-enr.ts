import { SignableENR } from '@chainsafe/enr';
import { multiaddr } from '@multiformats/multiaddr';

import { AZTEC_ENR_KEY, AztecENR } from '../types/index.js';
import { convertToMultiaddr, createLibP2PPeerIdFromPrivateKey } from '../util.js';

export async function createBootnodeENR(
  privateKey: string,
  udpAnnounceAddress: string,
  network: keyof typeof AztecENR,
): Promise<SignableENR> {
  const peerId = await createLibP2PPeerIdFromPrivateKey(privateKey);
  const enr = SignableENR.createFromPeerId(peerId);
  const publicAddr = multiaddr(convertToMultiaddr(udpAnnounceAddress, 'udp'));
  enr.setLocationMultiaddr(publicAddr);
  enr.set(AZTEC_ENR_KEY, Uint8Array.from([AztecENR[network]]));
  return enr;
}
