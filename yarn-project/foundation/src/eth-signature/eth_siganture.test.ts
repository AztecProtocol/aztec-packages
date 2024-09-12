
import { Fr } from '@aztec/foundation/fields';

import { Signature } from './eth_signature.js';
import { randomBytes } from '../crypto/index.js';
import { Secp256k1Signer, recoverAddress } from '@aztec/foundation/crypto';
import { Buffer32 } from '@aztec/foundation/buffer';

const randomSigner = () => {
    const pk = Buffer32.fromBuffer(randomBytes(32));
    return new Secp256k1Signer(pk);
}

describe('Signature serialization / deserialization', () => {
  it('Should serialize / deserialize', () => {
    const signer = randomSigner();

    const originalMessage = Fr.random();
    const message = Buffer32.fromField(originalMessage);

    const signature = signer.sign(message);

    console.log(signature);

    // Serde
    const serialized = signature.toBuffer();
    const deserialized = Signature.fromBuffer(serialized);
    expect(deserialized).toEqual(signature);

    // Recover signature
    const sender = recoverAddress(message, signature);
    // TODO(md): add a getAddress method to the signer
    // expect(sender).toEqual(signer.getAddress());
  });
});
