// Serde test for the block attestation type
import { makeHeader } from '@aztec/circuits.js/testing';

import { BlockAttestation } from './block_attestation.js';
import { Signature } from './signature.js';

const makeBlockAttestation = (): BlockAttestation => {
  const blockHeader = makeHeader(1);
  const signature = Signature.fromBuffer(Buffer.alloc(68, 1));

  return new BlockAttestation(blockHeader, signature);
};

describe('Block Attestation serialization / deserialization', () => {
  it('Should serialize / deserialize', () => {
    const attestation = makeBlockAttestation();

    const serialized = attestation.toBuffer();
    const deserialized = BlockAttestation.fromBuffer(serialized);

    expect(deserialized).toEqual(attestation);
  });
});
