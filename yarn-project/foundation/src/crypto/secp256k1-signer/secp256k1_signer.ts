import { type Buffer32 } from '@aztec/foundation/buffer';
import { type EthAddress } from '@aztec/foundation/eth-address';
import { type Signature } from '@aztec/foundation/eth-signature';

import { addressFromPrivateKey, signMessage } from './utils.js';

export class Secp256k1Signer {
  public readonly address: EthAddress;

  constructor(private privateKey: Buffer32) {
    this.address = addressFromPrivateKey(privateKey.buffer);
  }

  sign(message: Buffer32): Signature {
    return signMessage(message, this.privateKey.buffer);
  }
}
