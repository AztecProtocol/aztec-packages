import type { LogFn } from '@aztec/foundation/log';
import { createBootnodeENRandPeerId } from '@aztec/p2p/enr';

export function generateEncodedBootnodeENR(
  privateKey: string,
  p2pIp: string,
  p2pPort: number,
  l1ChainId: number,
  log: LogFn,
) {
  const { enr } = createBootnodeENRandPeerId(privateKey, p2pIp, p2pPort, l1ChainId);
  log(`ENR: ${enr.encodeTxt()}`);
}
