import { mod } from '@noble/curves/abstract/modular';
import { bytesToNumberBE } from '@noble/curves/abstract/utils';
import { bn254 } from '@noble/curves/bn254';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha2';
import { mnemonicToSeedSync } from '@scure/bip39';

import type { Hex } from '../../string/index.js';
// Convenience functions using Bn254 class (for backwards compatibility)
import { Bn254 } from '../bn254/index.js';

// Re-export BN254 operations
export { Bn254, type Bn254G1Point, type Bn254G2Point } from '../bn254/index.js';

const bn254Instance = new Bn254();

export const computeBn254G1PublicKeyCompressed = (privateKeyHex: string): Promise<string> =>
  bn254Instance.computeG1PublicKeyCompressed(privateKeyHex);
export const computeBn254G1PublicKey = (privateKeyHex: string): Promise<import('../bn254/index.js').Bn254G1Point> =>
  bn254Instance.computeG1PublicKey(privateKeyHex);
export const computeBn254G2PublicKey = (privateKeyHex: string) => bn254Instance.computeG2PublicKey(privateKeyHex);
export const compressBn254G1Point = (point: { x: bigint; y: bigint }): string => bn254Instance.compressG1Point(point);
export const decompressBn254G1Point = (compressed: string) => bn254Instance.decompressG1Point(compressed);
export const isOnBn254Curve = (point: { x: bigint; y: bigint }): boolean => bn254Instance.isOnCurve(point);

// Re-export EIP-2335 keystore utilities
export {
  Eip2335Error,
  type Eip2335Keystore,
  createEip2335Keystore,
  decryptEip2335Keystore,
  decryptEip2335KeystoreFromObject,
  loadEip2335Keystore,
  verifyEip2335Keypair,
} from './eip2335.js';

export function deriveBlsPrivateKey(mnemonic: string | undefined, ikm: string | undefined, path: string): Hex<32> {
  if (ikm) {
    return deriveBlsKeyFromEntropy(ikm, path) as Hex<32>;
  }
  if (!mnemonic) {
    throw new Error('Either mnemonic or ikm must be provided for BLS derivation');
  }
  return deriveBlsKeyFromMnemonic(mnemonic, path) as Hex<32>;
}

/**
 * Deterministically derive a BN254 BLS private key from mnemonic and derivation path.
 * Returns a 0x-prefixed 32-byte hex string representing an Fr in [1, r-1].
 */
export function deriveBlsKeyFromMnemonic(mnemonic: string, derivationPath: string, passphrase = ''): string {
  const seed = Buffer.from(mnemonicToSeedSync(mnemonic, passphrase)); // 64 bytes
  const data = Buffer.concat([Buffer.from([0x00]), seed, Buffer.from(derivationPath, 'utf8')]);
  const sk = deriveBn254ScalarFromData(data);
  return `0x${toFixed32(sk).toString('hex')}`;
}

/**
 * Deterministically derive a BN254 BLS private key from input keying material (IKM) and derivation path.
 * Returns a 0x-prefixed 32-byte hex string representing an Fr in [1, r-1].
 */
export function deriveBlsKeyFromEntropy(ikm: string, derivationPath: string): string {
  const ikmBytes = parseIkm(ikm);
  const data = Buffer.concat([Buffer.from([0x01]), ikmBytes, Buffer.from(derivationPath, 'utf8')]);
  const sk = deriveBn254ScalarFromData(data);
  return `0x${toFixed32(sk).toString('hex')}`;
}

function deriveBn254ScalarFromData(data: Buffer): bigint {
  // Domain-separated HMAC-SHA512, then map to BN254 Fr using noble modular math. Retry on zero.
  const domainKey = Buffer.from('Aztec bn254 key', 'utf8');
  for (let counter = 0; ; counter = (counter + 1) & 0xff) {
    const msg = counter === 0 ? data : Buffer.concat([data, Buffer.from([counter])]);
    const digest = hmac(sha512, domainKey, msg); // 64 bytes
    const x = bytesToNumberBE(digest);
    const sk = mod(x, bn254.fields.Fr.ORDER);
    if (sk !== 0n) {
      return sk;
    }
  }
}

function parseIkm(ikm: string): Buffer {
  const hexMatch = ikm.replace(/^0x/i, '');
  if (/^[0-9a-fA-F]+$/.test(hexMatch) && hexMatch.length >= 2) {
    const normalized = hexMatch.length % 2 === 1 ? `0${hexMatch}` : hexMatch;
    return Buffer.from(normalized, 'hex');
  }
  return Buffer.from(ikm, 'utf8');
}

function toFixed32(x: bigint): Buffer {
  const hex = x.toString(16);
  const padded = hex.length % 2 === 1 ? `0${hex}` : hex;
  const buf = Buffer.from(padded, 'hex');
  if (buf.length === 32) {
    return buf;
  }
  if (buf.length < 32) {
    return Buffer.concat([Buffer.alloc(32 - buf.length, 0), buf]);
  }
  // Should never happen since x < bn254.Fr.ORDER < 2^256, but guard anyway
  return buf.subarray(buf.length - 32);
}
