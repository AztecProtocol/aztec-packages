import { secp256k1 } from '@noble/curves/secp256k1';

import { Buffer32 } from '../../buffer/buffer32.js';
import { EthAddress } from '../../eth-address/index.js';
import { Signature } from '../../eth-signature/eth_signature.js';
import { keccak256 } from '../keccak/index.js';

const ETH_SIGN_PREFIX = '\x19Ethereum Signed Message:\n32';

/** Signature recovery options */
type RecoveryOpts = {
  /**
   * Whether to allow s-values in the high half of the curve (s >= CURVE.n/2).
   * These are discouraged by EIP2 to prevent signature malleability, and outright
   * rejected in OpenZeppelin's ECDSA recover, which we use in our Rollup contract.
   */
  allowMalleable?: boolean;
  /**
   * Whether to allow an y-parity 0-1 bit instead of the standard v value 27-28.
   */
  allowYParityAsV?: boolean;
};

export class Secp256k1Error extends Error {
  constructor(message: string, opts?: { cause: unknown }) {
    super(message, opts);
    this.name = 'Secp256k1Error';
  }
}

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
 * @param opts - Recovery options.
 * @returns The address.
 * @throws Error if signature recovery fails or if signature is malleable and allowMalleable is false.
 */
export function recoverAddress(hash: Buffer32, signature: Signature, opts?: RecoveryOpts): EthAddress {
  try {
    const publicKey = recoverPublicKey(hash, signature, opts);
    return publicKeyToAddress(publicKey);
  } catch (err: unknown) {
    throw new Secp256k1Error(
      `Error recovering Ethereum address from hash ${hash.toString()} and signature ${signature.toString()}`,
      { cause: err },
    );
  }
}

/**
 * Safely attempts to recover an address from a hash and a signature.
 * @param hash - The hash to recover the address from.
 * @param signature - The signature to recover the address from.
 * @param opts - Recovery options.
 * @returns The address if recovery succeeds, undefined otherwise.
 */
export function tryRecoverAddress(hash: Buffer32, signature: Signature, opts?: RecoveryOpts): EthAddress | undefined {
  try {
    const publicKey = recoverPublicKey(hash, signature, opts);
    return publicKeyToAddress(publicKey);
  } catch {
    return undefined;
  }
}

/**
 * @attribution - viem
 * Converts a yParityOrV value to a recovery bit.
 * @param yParityOrV - The yParityOrV value to convert.
 * @returns The recovery bit.
 */
export function toRecoveryBit(yParityOrV: number) {
  if (yParityOrV === 0 || yParityOrV === 1) {
    return yParityOrV;
  }
  if (yParityOrV === 27) {
    return 0;
  }
  if (yParityOrV === 28) {
    return 1;
  }
  throw new Secp256k1Error(`Invalid yParityOrV value ${yParityOrV}`);
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
 * Flips an ECDSA signature.
 * If the signature has a low s-value (s < CURVE.n/2), it flips it to high s-value (CURVE.n - s) and vice versa.
 * Also flips the v value accordingly (27 <-> 28, or 0 <-> 1).
 * This is useful for testing signature malleability handling.
 * @param signature - The signature to flip.
 * @returns A new signature with flipped s-value and v-value.
 */
export function flipSignature(signature: Signature): Signature {
  const { r, s, v } = signature;
  const sig = new secp256k1.Signature(r.toBigInt(), s.toBigInt());
  const flippedS = secp256k1.CURVE.n - sig.s;

  return new Signature(r, Buffer32.fromBigInt(flippedS), flipV(v));
}

/**
 * Normalizes an ECDSA signature.
 * If the signature has a high s-value (s >= CURVE.n/2), it flips it to low s-value (CURVE.n - s), and flips v accordingly.
 * If the signature uses a recovery bit of 0/1, it is converted to a v-value 27/28 for ecrecover.
 * @remarks This does not handle post EIP155 tx signatures which embed the chain id in v. Use it only for feeding into ECRECOVER precompiles.
 * @param signature - The signature to normalize.
 */
export function normalizeSignature(signature: Signature): Signature {
  const { r, s, v } = signature;
  const sig = new secp256k1.Signature(r.toBigInt(), s.toBigInt());
  if (sig.hasHighS()) {
    const newV = flipV(v);
    const newS = sig.normalizeS().s;
    return new Signature(r, Buffer32.fromBigInt(newS), toVFromYParityOrV(newV));
  }

  return new Signature(r, s, toVFromYParityOrV(v));
}

/** Converts a yParityOrV value to a pre-EIP155 v-value 27-28. */
function toVFromYParityOrV(yParityOrV: number): number {
  if (yParityOrV === 0 || yParityOrV === 1) {
    return yParityOrV + 27;
  } else if (yParityOrV === 27 || yParityOrV === 28) {
    return yParityOrV;
  } else {
    throw new Secp256k1Error(`Invalid yParityOrV value ${yParityOrV}`);
  }
}

/** Flips the recovery bit or v-value */
function flipV(v: number): number {
  switch (v) {
    case 27:
      return 28;
    case 28:
      return 27;
    case 0:
      return 1;
    case 1:
      return 0;
    default:
      throw new Secp256k1Error(`Invalid v value ${v}`);
  }
}

/**
 * Recovers a public key from a hash and a signature.
 * @param hash - The hash to recover the public key from.
 * @param signature - The signature to recover the public key from.
 * @returns The public key.
 */
export function recoverPublicKey(hash: Buffer32, signature: Signature, opts: RecoveryOpts = {}): Buffer {
  const { r, s, v } = signature;
  if (!opts.allowYParityAsV && v !== 27 && v !== 28) {
    throw new Secp256k1Error(`Invalid v value ${v} (expected 27 or 28)`);
  }
  const recoveryBit = toRecoveryBit(v);
  const sig = new secp256k1.Signature(r.toBigInt(), s.toBigInt()).addRecoveryBit(recoveryBit);
  if (!opts.allowMalleable && sig.hasHighS()) {
    throw new Secp256k1Error('Signature has high s-value (malleable signature)');
  }
  const publicKey = sig.recoverPublicKey(hash.buffer).toHex(false);
  return Buffer.from(publicKey, 'hex');
}
