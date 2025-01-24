// Serde test for the block attestation type
import { Secp256k1Signer } from '@aztec/foundation/crypto';

import { BlockAttestation } from './block_attestation.js';
import { makeBlockAttestation } from './mocks.js';

describe('Block Attestation serialization / deserialization', () => {
  const checkEquivalence = (serialized: BlockAttestation, deserialized: BlockAttestation) => {
    expect(deserialized.getSize()).toEqual(serialized.getSize());
    expect(deserialized).toEqual(serialized);
  };

  it('Should serialize / deserialize', async () => {
    const attestation = await makeBlockAttestation();

    const serialized = attestation.toBuffer();
    const deserialized = BlockAttestation.fromBuffer(serialized);
    checkEquivalence(attestation, deserialized);
  });

  it('Should serialize / deserialize + recover sender', async () => {
    const account = Secp256k1Signer.random();

    const attestation = await makeBlockAttestation({ signer: account });
    const serialized = attestation.toBuffer();
    const deserialized = BlockAttestation.fromBuffer(serialized);

    checkEquivalence(attestation, deserialized);

    // Recover signature
    const sender = await deserialized.getSender();
    expect(sender).toEqual(account.address);
  });
});
