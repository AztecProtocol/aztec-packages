import { secp256k1 } from "@noble/curves/secp256k1";
import { EthAddress } from "../../eth-address/index.js";
import { keccak256 } from "../keccak/index.js";
import { Signature } from "../../eth-signature/eth_signature.js";
import { Buffer32 } from "../../buffer/buffer32.js";

function publicKeyToAddress(publicKey: Buffer): EthAddress {
  const hash = keccak256(publicKey.slice(1));
  return new EthAddress(hash.subarray(12));
}

export function recoverAddress(hash: Buffer32, signature: Signature): EthAddress {
    const publicKey = recoverPublicKey(hash, signature);
    return publicKeyToAddress(publicKey);
}

function toRecoveryBit(yParityOrV: number) {
    if (yParityOrV === 0 || yParityOrV === 1) return yParityOrV
    if (yParityOrV === 27) return 0
    if (yParityOrV === 28) return 1
    throw new Error('Invalid yParityOrV value')
}

export function signMessage(message: Buffer32, privateKey: Buffer) {
    const {r,s,recovery} = secp256k1.sign(message.buffer, privateKey)
    return new Signature(
        Buffer32.fromBigInt(r),
        Buffer32.fromBigInt(s),
        recovery ? 28 : 27
    );
}

export function recoverPublicKey(
    hash: Buffer32,
    signature: Signature,
  ): Buffer {

    const signature_ = (() => {
      // typeof signature: `Signature`
        const { r, s, v  } = signature
        const recoveryBit = toRecoveryBit(v)
        return new secp256k1.Signature(
          r.toBigInt(),
          s.toBigInt(),
        ).addRecoveryBit(recoveryBit)
    })()

    const publicKey = signature_
      .recoverPublicKey(hash.buffer)
      .toHex(false)
    return Buffer.from(publicKey, 'hex');
  }