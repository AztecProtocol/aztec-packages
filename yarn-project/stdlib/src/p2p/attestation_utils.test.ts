import { SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Signature } from '@aztec/foundation/eth-signature';

import { jest } from '@jest/globals';

import { CommitteeAttestationsAndSigners } from '../block/proposal/attestations_and_signers.js';
import { CheckpointHeader } from '../rollup/index.js';
import { TEST_COORDINATION_SIGNATURE_CONTEXT } from '../tests/mocks.js';
import { orderAttestations, trimAttestations } from './attestation_utils.js';
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

/**
 * Rewrites the attester signature's recovery byte into yParity form (27 -> 0, 28 -> 1) while keeping
 * (r, s). Since the recovery bit is unchanged, the signature still recovers to the same signer, but the
 * non-canonical `v` is what a malicious committee member (or a peer mutating the byte in flight) can
 * emit to make `packAttestations` and `getSigners` disagree.
 */
function toYParityForm(attestation: CheckpointAttestation): CheckpointAttestation {
  const sig = attestation.signature;
  const yParityV = sig.v === 27 ? 0 : sig.v === 28 ? 1 : sig.v;
  return new CheckpointAttestation(
    attestation.payload,
    new Signature(sig.r, sig.s, yParityV),
    attestation.proposerSignature,
  );
}

function popcount(hex: `0x${string}`): number {
  let count = 0;
  for (const byte of Buffer.from(hex.slice(2), 'hex')) {
    let b = byte;
    while (b) {
      count += b & 1;
      b >>= 1;
    }
  }
  return count;
}

describe('orderAttestations', () => {
  it('normalizes yParity (v=0/v=1) attester signatures to canonical v', () => {
    // Generate enough signers that both recovery bits (v=27 -> 0 and v=28 -> 1) are exercised.
    const items = Array.from({ length: 8 }, () => makeSignerAndAttestation());
    const committee = items.map(i => i.address);
    const yParityAttestations = items.map(i => toYParityForm(i.attestation));

    // Sanity check that the fixture actually produced non-canonical signatures for both recovery bits.
    const emittedVs = new Set(yParityAttestations.map(a => a.signature.v));
    expect([...emittedVs].every(v => v === 0 || v === 1)).toBe(true);

    const ordered = orderAttestations(yParityAttestations, committee);

    for (const [i, attestation] of ordered.entries()) {
      expect([27, 28]).toContain(attestation.signature.v);
      expect(attestation.address.toString()).toEqual(committee[i].toString());
    }
  });

  it('produces an L1-consistent bundle (popcount === signers.length) for yParity signatures', () => {
    const items = Array.from({ length: 8 }, () => makeSignerAndAttestation());
    const committee = items.map(i => i.address);
    const yParityAttestations = items.map(i => toYParityForm(i.attestation));

    const ordered = orderAttestations(yParityAttestations, committee);
    const bundle = new CommitteeAttestationsAndSigners(ordered, TEST_COORDINATION_SIGNATURE_CONTEXT);

    const packed = bundle.getPackedAttestations();
    expect(popcount(packed.signatureIndices)).toEqual(bundle.getSigners().length);
    // Every signing slot must carry a canonical v so L1 ECDSA.recover (used at proving time) accepts it.
    for (const attestation of ordered) {
      if (!attestation.signature.isEmpty()) {
        expect([27, 28]).toContain(attestation.signature.v);
      }
    }
  });

  it('leaves non-signing committee members as empty address-only slots', () => {
    const items = Array.from({ length: 3 }, () => makeSignerAndAttestation());
    const missing = Secp256k1Signer.random().address;
    const committee = [...items.map(i => i.address), missing];

    const ordered = orderAttestations(
      items.map(i => toYParityForm(i.attestation)),
      committee,
    );

    expect(ordered[3].address.toString()).toEqual(missing.toString());
    expect(ordered[3].signature.isEmpty()).toBe(true);
  });
});

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
