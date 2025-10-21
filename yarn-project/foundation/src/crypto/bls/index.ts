import { mod } from '@noble/curves/abstract/modular';
import { bytesToNumberBE } from '@noble/curves/abstract/utils';
import { bn254 } from '@noble/curves/bn254';
import { mnemonicToSeedSync } from '@scure/bip39';

import { sha512 as sha512Hash } from '../sha512/index.js';

// Re-export BN254 point operations
export {
  computeBn254G1PublicKeyCompressed,
  computeBn254G1PublicKey,
  computeBn254G2PublicKey,
  compressBn254G1Point,
  decompressBn254G1Point,
  isOnBn254Curve,
} from './bn254_point.js';

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
    const digest = hmacSha512(domainKey, msg); // 64 bytes
    const x = bytesToNumberBE(digest);
    const sk = mod(x, bn254.fields.Fr.ORDER);
    if (sk !== 0n) {
      return sk;
    }
  }
}

function hmacSha512(key: Buffer, msg: Buffer): Buffer {
  // HMAC over SHA-512 (block size 128 bytes)
  const blockSize = 128;
  let k = key;
  if (k.length > blockSize) {
    k = sha512Hash(k);
  }
  if (k.length < blockSize) {
    k = Buffer.concat([k, Buffer.alloc(blockSize - k.length, 0)]);
  }

  const ipad = Buffer.alloc(blockSize, 0x36);
  const opad = Buffer.alloc(blockSize, 0x5c);
  const kIpad = Buffer.alloc(blockSize);
  const kOpad = Buffer.alloc(blockSize);
  for (let i = 0; i < blockSize; i++) {
    kIpad[i] = k[i] ^ ipad[i];
    kOpad[i] = k[i] ^ opad[i];
  }

  const inner = sha512Hash(Buffer.concat([kIpad, msg]));
  const outer = sha512Hash(Buffer.concat([kOpad, inner]));
  return outer;
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
