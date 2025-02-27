import type { LogFn } from '@aztec/foundation/log';
import { createBootnodeENRandPeerId } from '@aztec/p2p/enr';

export async function generateEncodedBootnodeENR(
  privateKey: string,
  udpAnnounceAddress: string,
  l1ChainId: number,
  log: LogFn,
) {
  const { enr } = await createBootnodeENRandPeerId(privateKey, udpAnnounceAddress, l1ChainId);
  log(`ENR: ${enr.encodeTxt()}`);
}
