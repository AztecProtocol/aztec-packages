import { EpochNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';

import { randomCheckpointInfo } from '../checkpoint/checkpoint_info.js';
import { CommitteeAttestationsAndSigners } from './proposal/attestations_and_signers.js';
import { CommitteeAttestation } from './proposal/committee_attestation.js';
import {
  type ValidateCheckpointResult,
  deserializeValidateCheckpointResult,
  serializeValidateCheckpointResult,
} from './validate_block_result.js';

describe('ValidateCheckpointResult', () => {
  // A non-trivial packed tuple with a signature slot and an address-only slot, so the round-trip exercises
  // both packed segments rather than the empty (0x, 0x) tuple.
  const verbatimAttestations = CommitteeAttestationsAndSigners.packAttestations([
    new CommitteeAttestation(EthAddress.ZERO, new Signature(Buffer32.random(), Buffer32.random(), 27)),
    CommitteeAttestation.fromAddress(EthAddress.random()),
  ]);

  describe('serialization to buffer', () => {
    it('valid result', () => {
      const result: ValidateCheckpointResult = { valid: true };
      const serialized = serializeValidateCheckpointResult(result);
      const deserialized = deserializeValidateCheckpointResult(serialized);
      expect(deserialized).toEqual(result);
    });

    it('invalid-attestation result', () => {
      const result: ValidateCheckpointResult = {
        valid: false,
        reason: 'invalid-attestation',
        checkpoint: randomCheckpointInfo(),
        committee: [EthAddress.random(), EthAddress.random()],
        epoch: EpochNumber(1),
        seed: 2n,
        attestors: [EthAddress.random(), EthAddress.random()],
        invalidIndex: 4,
        attestations: [CommitteeAttestation.random(), CommitteeAttestation.random()],
        verbatimAttestations,
      };
      const serialized = serializeValidateCheckpointResult(result);
      const deserialized = deserializeValidateCheckpointResult(serialized);
      expect(deserialized).toEqual(result);
    });

    it('insufficient-attestations result', () => {
      const result: ValidateCheckpointResult = {
        valid: false,
        reason: 'insufficient-attestations',
        checkpoint: randomCheckpointInfo(),
        committee: [EthAddress.random(), EthAddress.random()],
        epoch: EpochNumber(1),
        seed: 2n,
        attestors: [EthAddress.random(), EthAddress.random()],
        attestations: [CommitteeAttestation.random(), CommitteeAttestation.random()],
        verbatimAttestations,
      };
      const serialized = serializeValidateCheckpointResult(result);
      const deserialized = deserializeValidateCheckpointResult(serialized);
      expect(deserialized).toEqual(result);
    });

    it('preserves the packed attestations tuple byte-for-byte through a round-trip', () => {
      const result: ValidateCheckpointResult = {
        valid: false,
        reason: 'invalid-attestation',
        checkpoint: randomCheckpointInfo(),
        committee: [EthAddress.random()],
        epoch: EpochNumber(1),
        seed: 2n,
        attestors: [EthAddress.random()],
        invalidIndex: 0,
        attestations: [CommitteeAttestation.random()],
        verbatimAttestations,
      };
      const deserialized = deserializeValidateCheckpointResult(serializeValidateCheckpointResult(result));
      expect(deserialized.valid).toBe(false);
      expect((deserialized as typeof result).verbatimAttestations).toEqual(verbatimAttestations);
    });
  });
});
