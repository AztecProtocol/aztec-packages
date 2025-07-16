import { Buffer32 } from '@aztec/foundation/buffer';
import { Secp256k1Signer, recoverAddress } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import { Signature } from './eth_signature.js';

const randomSigner = () => {
  const pk = Buffer32.random();
  return new Secp256k1Signer(pk);
};

describe('eth signature', () => {
  let message: Buffer32;
  let signer: Secp256k1Signer;
  let signature: Signature;

  beforeAll(() => {
    signer = randomSigner();
    message = Buffer32.fromField(Fr.random());
    signature = signer.sign(message);
  });

  const checkEquivalence = (serialized: Signature, deserialized: Signature) => {
    expect(deserialized.getSize()).toEqual(serialized.getSize());
    expect(deserialized).toEqual(serialized);
  };

  it('should serialize and deserialize to buffer', () => {
    const serialized = signature.toBuffer();
    const deserialized = Signature.fromBuffer(serialized);
    checkEquivalence(signature, deserialized);
  });

  it('should serialize and deserialize real signature to hex string', () => {
    const serialized = signature.toString();
    const deserialized = Signature.fromString(serialized);
    checkEquivalence(signature, deserialized);
  });

  it('should recover signer from signature', () => {
    const sender = recoverAddress(message, signature);
    expect(sender).toEqual(signer.address);
  });

  it('should serialize and deserialize to hex string with v=0', () => {
    const signature = new Signature(Buffer32.random(), Buffer32.random(), 0);
    const serialized = signature.toString();
    const deserialized = Signature.fromString(serialized);
    checkEquivalence(signature, deserialized);
  });

  it('should serialize and deserialize to hex string with 1-digit v', () => {
    const signature = new Signature(Buffer32.random(), Buffer32.random(), 1);
    const serialized = signature.toString();
    const deserialized = Signature.fromString(serialized);
    checkEquivalence(signature, deserialized);
  });

  it('should serialize and deserialize to hex string with 2-digit v', () => {
    const signature = new Signature(Buffer32.random(), Buffer32.random(), 26);
    const serialized = signature.toString();
    const deserialized = Signature.fromString(serialized);
    checkEquivalence(signature, deserialized);
  });
});
