import type { LogFn } from '@aztec/foundation/log';
import { createSecp256k1PrivateKeyWithPeerId, privateKeyToHex } from '@aztec/p2p';

export async function generateP2PPrivateKey(log: LogFn) {
  const { privateKey, peerId } = await createSecp256k1PrivateKeyWithPeerId();
  log(`Private key: ${privateKeyToHex(privateKey)}`);
  log(`Peer Id: ${peerId}`);
}
