import { type LogFn } from '@aztec/foundation/log';
import { createBootnodeENR } from '@aztec/p2p/enr';

export async function generateEncodedBootnodeENR(privateKey: string, udpAnnounceAddress: string, log: LogFn) {
  const encodedENR = await createBootnodeENR(privateKey, udpAnnounceAddress);
  log(`ENR: ${encodedENR.encodeTxt()}`);
}
