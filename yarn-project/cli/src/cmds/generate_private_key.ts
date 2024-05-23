import { Fr, GrumpkinPrivateKey } from '@aztec/aztec.js';

export function generateKeys() {
  return {
    privateEncryptionKey: Fr.random(),
    privateSigningKey: GrumpkinPrivateKey.random(),
  };
}
