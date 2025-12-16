import { EthAddress } from '@aztec/foundation/eth-address';

import { randomBlockInfo } from './l2_block_info.js';
import { CommitteeAttestation } from './proposal/committee_attestation.js';
import {
  type ValidateBlockResult,
  deserializeValidateBlockResult,
  serializeValidateBlockResult,
} from './validate_block_result.js';

describe('ValidateBlockResult', () => {
  describe('serialization to buffer', () => {
    it('valid result', () => {
      const result: ValidateBlockResult = { valid: true };
      const serialized = serializeValidateBlockResult(result);
      const deserialized = deserializeValidateBlockResult(serialized);
      expect(deserialized).toEqual(result);
    });

    it('invalid-attestation result', () => {
      const result: ValidateBlockResult = {
        valid: false,
        reason: 'invalid-attestation',
        block: randomBlockInfo(),
        committee: [EthAddress.random(), EthAddress.random()],
        epoch: 1n,
        seed: 2n,
        attestors: [EthAddress.random(), EthAddress.random()],
        invalidIndex: 4,
        attestations: [CommitteeAttestation.random(), CommitteeAttestation.random()],
      };
      const serialized = serializeValidateBlockResult(result);
      const deserialized = deserializeValidateBlockResult(serialized);
      expect(deserialized).toEqual(result);
    });

    it('insufficient-attestations result', () => {
      const result: ValidateBlockResult = {
        valid: false,
        reason: 'insufficient-attestations',
        block: randomBlockInfo(),
        committee: [EthAddress.random(), EthAddress.random()],
        epoch: 1n,
        seed: 2n,
        attestors: [EthAddress.random(), EthAddress.random()],
        attestations: [CommitteeAttestation.random(), CommitteeAttestation.random()],
      };
      const serialized = serializeValidateBlockResult(result);
      const deserialized = deserializeValidateBlockResult(serialized);
      expect(deserialized).toEqual(result);
    });
  });
});
