import type { ViemCommitteeAttestations } from '@aztec/ethereum/contracts';
import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { bufferToHex } from '@aztec/foundation/string';

import { type AbiParameter, encodeAbiParameters, keccak256 } from 'viem';

import { TEST_COORDINATION_SIGNATURE_CONTEXT } from '../../tests/mocks.js';
import {
  CommitteeAttestationsAndSigners,
  MaliciousYParityCommitteeAttestationsAndSigners,
} from './attestations_and_signers.js';
import { CommitteeAttestation } from './committee_attestation.js';

const committeeAttestationsStruct: AbiParameter = {
  type: 'tuple',
  components: [
    { name: 'signatureIndices', type: 'bytes' },
    { name: 'signaturesOrAddresses', type: 'bytes' },
  ],
};

/** keccak256 of the ABI-encoded CommitteeAttestations tuple, matching the on-chain attestationsHash. */
function attestationsHash(packed: ViemCommitteeAttestations): string {
  return keccak256(encodeAbiParameters([committeeAttestationsStruct], [packed]));
}

function repack(packed: ViemCommitteeAttestations, committeeSize: number): ViemCommitteeAttestations {
  return CommitteeAttestationsAndSigners.packAttestations(CommitteeAttestation.fromPacked(packed, committeeSize));
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

/** A signing attestation with the given recovery byte and non-zero (r, s). */
function signing(v: number): CommitteeAttestation {
  return new CommitteeAttestation(EthAddress.random(), new Signature(Buffer32.random(), Buffer32.random(), v));
}

describe('CommitteeAttestationsAndSigners.packAttestations', () => {
  it('keeps the bitmap popcount consistent with getSigners() for yParity (v=0/v=1) signatures', () => {
    const attestations = [
      signing(27),
      signing(0), // yParity form of a v=27 signature
      CommitteeAttestation.fromAddress(EthAddress.random()), // non-signing member (empty signature)
      signing(1), // yParity form of a v=28 signature
      signing(28),
    ];
    const bundle = new CommitteeAttestationsAndSigners(attestations, TEST_COORDINATION_SIGNATURE_CONTEXT);

    const packed = bundle.getPackedAttestations();
    // Four signing members, one empty slot.
    expect(bundle.getSigners().length).toEqual(4);
    expect(popcount(packed.signatureIndices)).toEqual(bundle.getSigners().length);
  });

  it('packs every signature slot with a canonical v so L1 ECDSA.recover accepts it at proving time', () => {
    const attestations = [signing(0), signing(1), signing(27), signing(28)];
    const bundle = new CommitteeAttestationsAndSigners(attestations, TEST_COORDINATION_SIGNATURE_CONTEXT);

    const unpacked = CommitteeAttestation.fromPacked(bundle.getPackedAttestations(), attestations.length);
    for (const attestation of unpacked) {
      expect([27, 28]).toContain(attestation.signature.v);
    }
  });

  it('still packs a genuinely empty signature as an address-only slot', () => {
    const address = EthAddress.random();
    const attestations = [signing(27), CommitteeAttestation.fromAddress(address)];
    const bundle = new CommitteeAttestationsAndSigners(attestations, TEST_COORDINATION_SIGNATURE_CONTEXT);

    expect(bundle.getSigners().map(s => s.toString())).not.toContain(address.toString());
    expect(popcount(bundle.getPackedAttestations().signatureIndices)).toEqual(1);
  });
});

// A repack (packAttestations ∘ fromPacked) is not a byte-faithful inverse of the raw L1 tuple, so the
// invalidation evidence must carry the raw bytes verbatim rather than re-derive them. These cases document
// exactly where the repacked bytes (and thus the attestationsHash) diverge from a maliciously-crafted tuple.
describe('packAttestations is not a byte-faithful inverse of fromPacked', () => {
  it('diverges for a yParity (v=0) signature slot: repack canonicalizes v to 27', () => {
    const raw: ViemCommitteeAttestations = {
      signatureIndices: '0x80', // bit 7 set -> slot 0 is a signature
      signaturesOrAddresses: bufferToHex(
        Buffer.concat([Buffer.from([0]), Buffer32.random().toBuffer(), Buffer32.random().toBuffer()]),
      ),
    };

    const repacked = repack(raw, 1);

    expect(repacked).not.toEqual(raw);
    expect(attestationsHash(repacked)).not.toEqual(attestationsHash(raw));
  });

  it('diverges for an all-zero signature slot: repack clears the bit and packs it as an address', () => {
    const raw: ViemCommitteeAttestations = {
      signatureIndices: '0x80', // bit set, but the 65-byte payload is all zero (v, r, s)
      signaturesOrAddresses: bufferToHex(Buffer.alloc(65)),
    };

    const repacked = repack(raw, 1);

    // fromPacked reads it as an empty signature, so the repack drops the bit and emits a 20-byte address.
    expect(repacked.signatureIndices).not.toEqual(raw.signatureIndices);
    expect(attestationsHash(repacked)).not.toEqual(attestationsHash(raw));
  });
});

describe('MaliciousYParityCommitteeAttestationsAndSigners', () => {
  it('rewrites every non-proposer signed slot to yParity form while keeping getSigners and the bitmap consistent', () => {
    const attestations = [signing(27), signing(28), CommitteeAttestation.fromAddress(EthAddress.random()), signing(27)];
    const proposerIndex = 0;
    const bundle = new MaliciousYParityCommitteeAttestationsAndSigners(
      attestations,
      proposerIndex,
      TEST_COORDINATION_SIGNATURE_CONTEXT,
    );

    const packed = bundle.getPackedAttestations();
    const unpacked = CommitteeAttestation.fromPacked(packed, attestations.length);

    // The proposer's own slot stays canonical; every other signed slot carries a yParity recovery byte.
    expect([27, 28]).toContain(unpacked[proposerIndex].signature.v);
    expect([0, 1]).toContain(unpacked[1].signature.v);
    expect([0, 1]).toContain(unpacked[3].signature.v);

    // The bitmap and signers are untouched, so propose() would not revert SignersSizeMismatch.
    const honest = new CommitteeAttestationsAndSigners(attestations, TEST_COORDINATION_SIGNATURE_CONTEXT);
    expect(packed.signatureIndices).toEqual(honest.getPackedAttestations().signatureIndices);
    expect(popcount(packed.signatureIndices)).toEqual(bundle.getSigners().length);
  });

  it('preserves (r, s) of the rewritten slots so they still recover to the same signer', () => {
    const attestations = [signing(27), signing(28)];
    const proposerIndex = 0;
    const flippedIndex = 1;
    const honest = new CommitteeAttestationsAndSigners(attestations, TEST_COORDINATION_SIGNATURE_CONTEXT);
    const bundle = new MaliciousYParityCommitteeAttestationsAndSigners(
      attestations,
      proposerIndex,
      TEST_COORDINATION_SIGNATURE_CONTEXT,
    );

    const honestSlot = CommitteeAttestation.fromPacked(honest.getPackedAttestations(), attestations.length)[
      flippedIndex
    ];
    const maliciousSlot = CommitteeAttestation.fromPacked(bundle.getPackedAttestations(), attestations.length)[
      flippedIndex
    ];

    expect(maliciousSlot.signature.r).toEqual(honestSlot.signature.r);
    expect(maliciousSlot.signature.s).toEqual(honestSlot.signature.s);
    expect(maliciousSlot.signature.v).toEqual(honestSlot.signature.v - 27);
  });
});
