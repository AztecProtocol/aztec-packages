import { SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';

import { jest } from '@jest/globals';

import { CheckpointHeader } from '../rollup/index.js';
import { TEST_COORDINATION_SIGNATURE_CONTEXT } from '../tests/mocks.js';
import { trimAttestations } from './attestation_utils.js';
import { CheckpointAttestation } from './checkpoint_attestation.js';
import { CheckpointProposal } from './checkpoint_proposal.js';
import { ConsensusPayload } from './consensus_payload.js';
import { getHashedSignaturePayloadTypedData } from './signature_utils.js';

function makeAttestation(signer: Secp256k1Signer): CheckpointAttestation {
  const header = CheckpointHeader.random({ slotNumber: SlotNumber(0) });
  const payload = new ConsensusPayload(header, Fr.random(), 0n, TEST_COORDINATION_SIGNATURE_CONTEXT);
  const attestationHash = getHashedSignaturePayloadTypedData(payload);
  const proposal = new CheckpointProposal(
    header,
    payload.archive,
    payload.feeAssetPriceModifier,
    signer.sign(attestationHash),
    TEST_COORDINATION_SIGNATURE_CONTEXT,
  );
  const proposalHash = getHashedSignaturePayloadTypedData(proposal);
  return new CheckpointAttestation(payload, signer.sign(attestationHash), signer.sign(proposalHash));
}

function makeSignerAndAttestation() {
  const signer = Secp256k1Signer.random();
  return { signer, attestation: makeAttestation(signer), address: signer.address };
}

describe('trimAttestations', () => {
  it('returns attestations unchanged when count <= required', () => {
    const items = Array.from({ length: 3 }, () => makeSignerAndAttestation());
    const proposer = items[0];

    const result = trimAttestations(
      items.map(i => i.attestation),
      3,
      proposer.address,
      [],
    );

    expect(result).toHaveLength(3);
  });

  it('trims to required count', () => {
    const items = Array.from({ length: 5 }, () => makeSignerAndAttestation());
    const proposer = items[0];

    const result = trimAttestations(
      items.map(i => i.attestation),
      3,
      proposer.address,
      [],
    );

    expect(result).toHaveLength(3);
  });

  it('always keeps proposer attestation', () => {
    const items = Array.from({ length: 5 }, () => makeSignerAndAttestation());
    // Proposer is the last item in the array
    const proposer = items[4];

    const result = trimAttestations(
      items.map(i => i.attestation),
      3,
      proposer.address,
      [],
    );

    expect(result).toHaveLength(3);
    const resultSenders = result.map(a => a.getSender()!.toString());
    expect(resultSenders).toContain(proposer.address.toString());
  });

  it('prioritizes local validator attestations over external ones', () => {
    const proposer = makeSignerAndAttestation();
    const local1 = makeSignerAndAttestation();
    const local2 = makeSignerAndAttestation();
    const external1 = makeSignerAndAttestation();
    const external2 = makeSignerAndAttestation();

    const allAttestations = [proposer, local1, local2, external1, external2].map(i => i.attestation);
    const localAddresses = [local1.address, local2.address];

    const result = trimAttestations(allAttestations, 3, proposer.address, localAddresses);

    expect(result).toHaveLength(3);
    const resultSenders = new Set(result.map(a => a.getSender()!.toString()));
    expect(resultSenders.has(proposer.address.toString())).toBe(true);
    expect(resultSenders.has(local1.address.toString())).toBe(true);
    expect(resultSenders.has(local2.address.toString())).toBe(true);
    expect(resultSenders.has(external1.address.toString())).toBe(false);
    expect(resultSenders.has(external2.address.toString())).toBe(false);
  });

  it('fills with external attestations when not enough local ones', () => {
    const proposer = makeSignerAndAttestation();
    const local1 = makeSignerAndAttestation();
    const external1 = makeSignerAndAttestation();
    const external2 = makeSignerAndAttestation();
    const external3 = makeSignerAndAttestation();

    const allAttestations = [proposer, local1, external1, external2, external3].map(i => i.attestation);

    const result = trimAttestations(allAttestations, 3, proposer.address, [local1.address]);

    expect(result).toHaveLength(3);
    const resultSenders = new Set(result.map(a => a.getSender()!.toString()));
    expect(resultSenders.has(proposer.address.toString())).toBe(true);
    expect(resultSenders.has(local1.address.toString())).toBe(true);
    // One external fills the remaining slot
    const externalIncluded = [external1, external2, external3].filter(e => resultSenders.has(e.address.toString()));
    expect(externalIncluded).toHaveLength(1);
  });

  it('handles proposer also being in local addresses without double-counting', () => {
    const proposer = makeSignerAndAttestation();
    const local1 = makeSignerAndAttestation();
    const external1 = makeSignerAndAttestation();
    const external2 = makeSignerAndAttestation();

    const allAttestations = [proposer, local1, external1, external2].map(i => i.attestation);
    // Proposer address is also listed in local addresses
    const localAddresses = [proposer.address, local1.address];

    const result = trimAttestations(allAttestations, 3, proposer.address, localAddresses);

    expect(result).toHaveLength(3);
    const resultSenders = result.map(a => a.getSender()!.toString());
    // Proposer should appear exactly once
    expect(resultSenders.filter(s => s === proposer.address.toString())).toHaveLength(1);
    expect(resultSenders).toContain(local1.address.toString());
  });

  it('skips attestations with unrecoverable signatures', () => {
    const proposer = makeSignerAndAttestation();
    const valid = makeSignerAndAttestation();
    const external1 = makeSignerAndAttestation();

    const badAttestation = makeSignerAndAttestation().attestation;
    jest.spyOn(badAttestation, 'getSender').mockReturnValue(undefined);

    const allAttestations = [proposer.attestation, valid.attestation, badAttestation, external1.attestation];

    const result = trimAttestations(allAttestations, 3, proposer.address, []);

    expect(result).toHaveLength(3);
    const resultSenders = result.map(a => a.getSender()?.toString()).filter(Boolean);
    expect(resultSenders).toHaveLength(3);
  });
});
