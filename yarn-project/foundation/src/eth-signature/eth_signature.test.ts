import { Buffer32 } from '@aztec/foundation/buffer';
import { Secp256k1Signer, recoverAddress } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import { Signature } from './eth_signature.js';

const randomSigner = () => {
  const pk = Buffer32.random();
  return new Secp256k1Signer(pk);
};

describe('Signature serialization / deserialization', () => {
  it('Should serialize / deserialize', () => {
    const signer = randomSigner();

    const originalMessage = Fr.random();
    const message = Buffer32.fromField(originalMessage);

    const signature = signer.sign(message);

    // Serde
    const serialized = signature.toBuffer();
    const deserialized = Signature.fromBuffer(serialized);
    expect(deserialized).toEqual(signature);

    // Recover signature
    const sender = recoverAddress(message, signature);
    expect(sender).toEqual(signer.address);
  });
});
