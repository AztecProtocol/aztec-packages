import { SignableENR } from '@chainsafe/enr';
import { multiaddr } from '@multiformats/multiaddr';

import { AZTEC_ENR_KEY } from '../types/index.js';
import { convertToMultiaddr, createLibP2PPeerIdFromPrivateKey } from '../util.js';

export async function createBootnodeENR(privateKey: string, udpAnnounceAddress: string): Promise<SignableENR> {
  const peerId = await createLibP2PPeerIdFromPrivateKey(privateKey);
  const enr = SignableENR.createFromPeerId(peerId);
  const publicAddr = multiaddr(convertToMultiaddr(udpAnnounceAddress, 'udp'));
  enr.setLocationMultiaddr(publicAddr);

  // Todo(@PhilWindle): This is temporary until we implement bootnode versioning
  enr.set(AZTEC_ENR_KEY, Uint8Array.from("I'm a bootnode"));
  return enr;
}
