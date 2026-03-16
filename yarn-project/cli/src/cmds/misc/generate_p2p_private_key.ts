import type { LogFn } from '@aztec/foundation/log';

import { generateKeyPair, privateKeyToProtobuf } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';

export async function generateP2PPrivateKey(log: LogFn) {
  const privateKey = await generateKeyPair('secp256k1');
  const peerId = peerIdFromPrivateKey(privateKey);
  const exportedPeerId = Buffer.from(privateKeyToProtobuf(privateKey)).toString('hex');
  log(`Private key: ${exportedPeerId}`);
  log(`Peer Id: ${peerId}`);
}
