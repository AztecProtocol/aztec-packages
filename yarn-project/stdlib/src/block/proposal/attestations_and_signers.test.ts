import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';

import { TEST_COORDINATION_SIGNATURE_CONTEXT } from '../../tests/mocks.js';
import { CommitteeAttestationsAndSigners } from './attestations_and_signers.js';
import { CommitteeAttestation } from './committee_attestation.js';

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
