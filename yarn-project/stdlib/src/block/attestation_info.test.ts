import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Signature } from '@aztec/foundation/eth-signature';

import { ConsensusPayload } from '../p2p/consensus_payload.js';
import { getHashedSignaturePayloadTypedData } from '../p2p/signature_utils.js';
import { getAttestationInfoFromPayload } from './attestation_info.js';
import { CommitteeAttestation } from './proposal/committee_attestation.js';

describe('getAttestationInfoFromPayload', () => {
  const payload = ConsensusPayload.random();
  const signer = Secp256k1Signer.random();
  const digest = getHashedSignaturePayloadTypedData(payload);
  const canonicalSignature = signer.sign(digest);

  it('recovers a canonical (v in {27, 28}) signature to its signer', () => {
    expect([27, 28]).toContain(canonicalSignature.v);
    const [info] = getAttestationInfoFromPayload(payload, [CommitteeAttestation.fromSignature(canonicalSignature)]);
    expect(info).toEqual({ address: signer.address, status: 'recovered-from-signature' });
  });

  it('rejects a yParity (v in {0, 1}) signature that still recovers off-chain to a committee member', () => {
    // The yParity form recovers to the same member with allowYParityAsV, but L1 ECDSA.recover only accepts
    // v in {27, 28}, so it must be classified invalid here to match L1 proving.
    const yParitySignature = new Signature(canonicalSignature.r, canonicalSignature.s, canonicalSignature.v - 27);
    const [info] = getAttestationInfoFromPayload(payload, [CommitteeAttestation.fromSignature(yParitySignature)]);
    expect(info).toEqual({ status: 'invalid-signature' });
  });

  it('reports an empty signature slot as empty', () => {
    const [info] = getAttestationInfoFromPayload(payload, [CommitteeAttestation.empty()]);
    expect(info).toEqual({ status: 'empty' });
  });
});
