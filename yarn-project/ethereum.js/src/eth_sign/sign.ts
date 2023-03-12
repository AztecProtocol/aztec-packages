import { EthAddress } from '../eth_address/index.js';
import { numToUInt8 } from '../serialize/index.js';
import { toBigIntBE, toBufferBE } from '../bigint_buffer/index.js';
import { keccak256 } from '../crypto/index.js';
import elliptic from 'elliptic';

const secp256k1 = new elliptic.ec('secp256k1');

export interface EthSignature {
  messageHash: Buffer;
  r: Buffer;
  s: Buffer;
  v: number;
  signature: Buffer;
}

export const encodeSignature = (v: number, r: Buffer, s: Buffer) => Buffer.concat([r, s, numToUInt8(v)]);

export const decodeSignature = (buf: Buffer) => ({
  r: toBigIntBE(buf.subarray(0, 32)),
  s: toBigIntBE(buf.subarray(32, 64)),
  v: buf[64],
});

export function signMessage(messageHash: Buffer, privateKey: Buffer) {
  return sign(messageHash, privateKey, 27);
}

export function sign(messageHash: Buffer, privateKey: Buffer, addToV = 0): EthSignature {
  const signature = secp256k1.keyFromPrivate(privateKey).sign(messageHash, { canonical: true });
  const v = signature.recoveryParam! + addToV;
  const r = signature.r.toBuffer('be', 32);
  const s = signature.s.toBuffer('be', 32);
  return {
    messageHash,
    v,
    r,
    s,
    signature: encodeSignature(v, r, s),
  };
}

export function recoverFromSignature(signature: EthSignature) {
  const { messageHash, v, r, s } = signature;
  return recoverFromSigBuffer(messageHash, encodeSignature(v, r, s));
}

export function recoverFromVRS(messageHash: Buffer, v: number, r: Buffer, s: Buffer) {
  return recoverFromSigBuffer(messageHash, encodeSignature(v, r, s));
}

export function recoverFromSigBuffer(messageHash: Buffer, signature: Buffer) {
  const vrs = decodeSignature(signature);
  const ecPublicKey = secp256k1.recoverPubKey(
    messageHash,
    {
      r: toBufferBE(vrs.r, 32),
      s: toBufferBE(vrs.s, 32),
    },
    vrs.v < 2 ? vrs.v : 1 - (vrs.v % 2),
  );
  const publicKey = Buffer.from(ecPublicKey.encode('hex', false).slice(2), 'hex');
  const publicHash = keccak256(publicKey);
  return new EthAddress(publicHash.slice(-20));
}

export function recover(signature: EthSignature): EthAddress;
export function recover(messageHash: Buffer, v: number, r: Buffer, s: Buffer): EthAddress;
export function recover(messageHash: Buffer, signature: Buffer): EthAddress;
export function recover(...args: any[]): EthAddress {
  switch (args.length) {
    case 1:
      return recoverFromSignature(args[0]);
    case 2:
      return recoverFromSigBuffer(args[0], args[1]);
    case 4:
      return recoverFromVRS(args[0], args[1], args[2], args[3]);
  }
  throw new Error('Cannot determine recovery function.');
}
