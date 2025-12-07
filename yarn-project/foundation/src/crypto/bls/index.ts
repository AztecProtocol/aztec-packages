import { Fr } from '@aztec/foundation/curves/bn254';
import type { Hex } from '@aztec/foundation/string';

import { mod } from '@noble/curves/abstract/modular';
import { bytesToNumberBE } from '@noble/curves/abstract/utils';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha2';
import { mnemonicToSeedSync } from '@scure/bip39';

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
    const sk = mod(x, Fr.MODULUS);
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
