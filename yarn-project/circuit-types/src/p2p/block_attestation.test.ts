// Serde test for the block attestation type
import { Secp256k1Signer } from '@aztec/foundation/crypto';

import { BlockAttestation } from './block_attestation.js';
import { makeBlockAttestation } from './mocks.js';

describe('Block Attestation serialization / deserialization', () => {
  it('Should serialize / deserialize', () => {
    const attestation = makeBlockAttestation();

    const serialized = attestation.toBuffer();
    const deserialized = BlockAttestation.fromBuffer(serialized);

    expect(deserialized).toEqual(attestation);
  });

  it('Should serialize / deserialize + recover sender', () => {
    const account = Secp256k1Signer.random();

    const proposal = makeBlockAttestation(account);
    const serialized = proposal.toBuffer();
    const deserialized = BlockAttestation.fromBuffer(serialized);

    expect(deserialized).toEqual(proposal);

    // Recover signature
    const sender = deserialized.getSender();
    expect(sender).toEqual(account.address);
  });
});
