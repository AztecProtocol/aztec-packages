import { secp256k1 } from '@noble/curves/secp256k1';

import { Buffer32 } from '../../buffer/buffer32.js';
import { EthAddress } from '../../eth-address/index.js';
import { Signature } from '../../eth-signature/eth_signature.js';
import { keccak256 } from '../keccak/index.js';

const ETH_SIGN_PREFIX = '\x19Ethereum Signed Message:\n32';

// We just hash the message to make it easier to work with in the smart contract.
export function makeEthSignDigest(message: Buffer32): Buffer32 {
  const prefix = Buffer.from(ETH_SIGN_PREFIX);
  return Buffer32.fromBuffer(keccak256(Buffer.concat([prefix, message.buffer])));
}

/**
 * Converts a public key to an address.
 * @param publicKey - The public key to convert.
 * @returns The address.
 */
function publicKeyToAddress(publicKey: Buffer): EthAddress {
  const hash = keccak256(publicKey.subarray(1));
  return new EthAddress(hash.subarray(12));
}

/**
 * Converts a private key to a public key.
 * @param privateKey - The private key to convert.
 * @returns The public key.
 */
export function publicKeyFromPrivateKey(privateKey: Buffer): Buffer {
  return Buffer.from(secp256k1.getPublicKey(privateKey, false));
}

/**
 * Converts a private key to an address.
 * @param privateKey - The private key to convert.
 * @returns The address.
 */
export function addressFromPrivateKey(privateKey: Buffer): EthAddress {
  const publicKey = publicKeyFromPrivateKey(privateKey);
  return publicKeyToAddress(publicKey);
}

/**
 * Recovers an address from a hash and a signature.
 * @param hash - The hash to recover the address from.
 * @param signature - The signature to recover the address from.
 * @returns The address.
 */
export function recoverAddress(hash: Buffer32, signature: Signature): EthAddress {
  const publicKey = recoverPublicKey(hash, signature);
  return publicKeyToAddress(publicKey);
}

/**
 * @attribution - viem
 * Converts a yParityOrV value to a recovery bit.
 * @param yParityOrV - The yParityOrV value to convert.
 * @returns The recovery bit.
 */
function toRecoveryBit(yParityOrV: number) {
  if (yParityOrV === 0 || yParityOrV === 1) {
    return yParityOrV;
  }
  if (yParityOrV === 27) {
    return 0;
  }
  if (yParityOrV === 28) {
    return 1;
  }
  throw new Error('Invalid yParityOrV value');
}

/**
 * Signs a message using ecdsa over the secp256k1 curve.
 * @param message - The message to sign.
 * @param privateKey - The private key to sign the message with.
 * @returns The signature.
 */
export function signMessage(message: Buffer32, privateKey: Buffer) {
  const { r, s, recovery } = secp256k1.sign(message.buffer, privateKey);
  return new Signature(Buffer32.fromBigInt(r), Buffer32.fromBigInt(s), recovery ? 28 : 27);
}

/**
 * Recovers a public key from a hash and a signature.
 * @param hash - The hash to recover the public key from.
 * @param signature - The signature to recover the public key from.
 * @returns The public key.
 */
export function recoverPublicKey(hash: Buffer32, signature: Signature): Buffer {
  const { r, s, v } = signature;
  const recoveryBit = toRecoveryBit(v);
  const sig = new secp256k1.Signature(r.toBigInt(), s.toBigInt()).addRecoveryBit(recoveryBit);

  const publicKey = sig.recoverPublicKey(hash.buffer).toHex(false);
  return Buffer.from(publicKey, 'hex');
}
