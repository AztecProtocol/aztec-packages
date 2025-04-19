// Serde test for the block attestation type
import { Secp256k1Signer } from '@aztec/foundation/crypto';

import { makeBlockAttestation } from '../tests/mocks.js';
import { BlockAttestation } from './block_attestation.js';

describe('Block Attestation serialization / deserialization', () => {
  const checkEquivalence = (serialized: BlockAttestation, deserialized: BlockAttestation) => {
    expect(deserialized.getSize()).toEqual(serialized.getSize());
    expect(deserialized).toEqual(serialized);
  };

  it('Should serialize / deserialize', () => {
    const attestation = makeBlockAttestation();

    const serialized = attestation.toBuffer();
    const deserialized = BlockAttestation.fromBuffer(serialized);
    checkEquivalence(attestation, deserialized);
  });

  it('Should serialize / deserialize + recover sender', () => {
    const account = Secp256k1Signer.random();

    const attestation = makeBlockAttestation({ signer: account });
    const serialized = attestation.toBuffer();
    const deserialized = BlockAttestation.fromBuffer(serialized);

    checkEquivalence(attestation, deserialized);

    // Recover signature
    const sender = deserialized.getSender();
    expect(sender).toEqual(account.address);
  });
});
