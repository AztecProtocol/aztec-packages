import { EpochNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';

import { randomCheckpointInfo } from '../checkpoint/checkpoint_info.js';
import { CommitteeAttestation } from './proposal/committee_attestation.js';
import {
  type ValidateCheckpointResult,
  deserializeValidateCheckpointResult,
  serializeValidateCheckpointResult,
} from './validate_block_result.js';

describe('ValidateCheckpointResult', () => {
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
      };
      const serialized = serializeValidateCheckpointResult(result);
      const deserialized = deserializeValidateCheckpointResult(serialized);
      expect(deserialized).toEqual(result);
    });
  });
});
