// Serde test for the block attestation type
import { BlockAttestation } from './block_attestation.js';
import { makeBlockAttestation, randomSigner } from './mocks.js';

describe('Block Attestation serialization / deserialization', () => {
  it('Should serialize / deserialize', () => {
    const attestation = makeBlockAttestation();

    const serialized = attestation.toBuffer();
    const deserialized = BlockAttestation.fromBuffer(serialized);

    expect(deserialized).toEqual(attestation);
  });

  it('Should serialize / deserialize + recover sender', () => {
    const account = randomSigner();

    const proposal = makeBlockAttestation(account);
    const serialized = proposal.toBuffer();
    const deserialized = BlockAttestation.fromBuffer(serialized);

    expect(deserialized).toEqual(proposal);

    // Recover signature
    const sender = deserialized.getSender();
    expect(sender).toEqual(account.address);
  });
});
