import { Buffer32 } from "@aztec/foundation/buffer";
import { Signature } from "@aztec/foundation/eth-signature";
import { signMessage } from "./utils.js";

export class Secp256k1Signer {
  constructor(private privateKey: Buffer32) {}

  sign(message: Buffer32): Signature {
    return signMessage(message, this.privateKey.buffer)
  }
}


