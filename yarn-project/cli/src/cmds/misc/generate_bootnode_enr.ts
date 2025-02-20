import { type LogFn } from '@aztec/foundation/log';
import { createBootnodeENR } from '@aztec/p2p/enr';
import { type AztecENR } from '@aztec/p2p/types';

export async function generateEncodedBootnodeENR(
  privateKey: string,
  udpAnnounceAddress: string,
  network: keyof typeof AztecENR,
  log: LogFn,
) {
  const encodedENR = await createBootnodeENR(privateKey, udpAnnounceAddress, network);
  log(`ENR: ${encodedENR.encodeTxt()}`);
}
