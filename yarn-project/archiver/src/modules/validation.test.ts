import type { EpochCache } from '@aztec/epoch-cache';
import { CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer, flipSignature } from '@aztec/foundation/crypto/secp256k1-signer';
import { Signature } from '@aztec/foundation/eth-signature';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { CommitteeAttestation, EthAddress } from '@aztec/stdlib/block';
import { Checkpoint, type PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import { toL1CheckpointHeader } from '@aztec/stdlib/rollup';
import { TEST_COORDINATION_SIGNATURE_CONTEXT } from '@aztec/stdlib/testing';

import { type MockProxy, mock } from 'jest-mock-extended';
import assert from 'node:assert';

import { makeSignedPublishedCheckpoint } from '../test/mock_structs.js';
import {
  type CheckpointForValidation,
  getAttestationInfoFromCheckpoint,
  validateCheckpointAttestations,
} from './validation.js';

/** Converts a published checkpoint into the raw shape consumed by validateCheckpointAttestations. */
function toValidationInput(published: PublishedCheckpoint): CheckpointForValidation {
  return {
    checkpointNumber: published.checkpoint.number,
    header: toL1CheckpointHeader(published.checkpoint.header),
    archiveRoot: Buffer32.fromField(published.checkpoint.archive.root),
    feeAssetPriceModifier: published.checkpoint.feeAssetPriceModifier,
    attestations: published.attestations,
  };
}

describe('validateCheckpointAttestations', () => {
  let epochCache: MockProxy<EpochCache>;
  let signers: Secp256k1Signer[];
  let committee: EthAddress[];
  let logger: Logger;

  const constants = { epochDuration: 10 };

  const makeCheckpoint = async (
    signers: Secp256k1Signer[],
    committee: EthAddress[],
    slot?: number,
    feeAssetPriceModifier?: bigint,
  ) => {
    const checkpoint = await Checkpoint.random(CheckpointNumber(1), {
      slotNumber: SlotNumber(slot ?? 1),
      feeAssetPriceModifier,
    });
    return makeSignedPublishedCheckpoint(checkpoint, signers, committee);
  };

  const setCommittee = (committee: EthAddress[]) => {
    epochCache.getCommitteeForEpoch.mockResolvedValue({
      committee,
      seed: 0n,
      epoch: EpochNumber(0),
      isEscapeHatchOpen: false,
    });
  };

  beforeEach(() => {
    epochCache = mock<EpochCache>();
    signers = times(5, () => Secp256k1Signer.random());
    committee = signers.map(signer => signer.address);
    logger = createLogger('archiver:test');
  });

  describe('with empty committee', () => {
    beforeEach(() => {
      setCommittee([]);
    });

    it('validates a checkpoint if no committee is found', async () => {
      const checkpoint = await makeCheckpoint([], []);
      const result = await validateCheckpointAttestations(
        toValidationInput(checkpoint),
        epochCache,
        constants,
        TEST_COORDINATION_SIGNATURE_CONTEXT,
        logger,
      );

      expect(result.valid).toBe(true);
      expect(epochCache.getCommitteeForEpoch).toHaveBeenCalledWith(EpochNumber(0));
    });

    it('validates a checkpoint with no attestations if no committee is found', async () => {
      const checkpoint = await makeCheckpoint(signers, committee);
      const result = await validateCheckpointAttestations(
        toValidationInput(checkpoint),
        epochCache,
        constants,
        TEST_COORDINATION_SIGNATURE_CONTEXT,
        logger,
      );

      expect(result.valid).toBe(true);
      expect(epochCache.getCommitteeForEpoch).toHaveBeenCalledWith(EpochNumber(0));
    });

    it('validates a checkpoint if escape hatch is open', async () => {
      // This should already be covered by the case of empty committee
      epochCache.isEscapeHatchOpen.mockResolvedValue(true);
      const checkpoint = await makeCheckpoint(signers, committee);
      const result = await validateCheckpointAttestations(
        toValidationInput(checkpoint),
        epochCache,
        constants,
        TEST_COORDINATION_SIGNATURE_CONTEXT,
        logger,
      );
      expect(result.valid).toBe(true);
      expect(epochCache.isEscapeHatchOpen).not.toHaveBeenCalled();
    });
  });

  describe('with committee', () => {
    beforeEach(() => {
      setCommittee(committee);
    });

    it('uses feeAssetPriceModifier when recovering attestors', async () => {
      const checkpoint = await makeCheckpoint(signers.slice(0, 4), committee, 1, 1n);

      const attestationInfos = getAttestationInfoFromCheckpoint(
        toValidationInput(checkpoint),
        TEST_COORDINATION_SIGNATURE_CONTEXT,
      );
      expect(attestationInfos.filter(a => a.status === 'recovered-from-signature').length).toBe(4);

      const result = await validateCheckpointAttestations(
        toValidationInput(checkpoint),
        epochCache,
        constants,
        TEST_COORDINATION_SIGNATURE_CONTEXT,
        logger,
      );
      expect(result.valid).toBe(true);
    });

    it('requests committee for the correct epoch', async () => {
      const checkpoint = await makeCheckpoint(signers, committee, 28);
      await validateCheckpointAttestations(
        toValidationInput(checkpoint),
        epochCache,
        constants,
        TEST_COORDINATION_SIGNATURE_CONTEXT,
        logger,
      );
      expect(epochCache.getCommitteeForEpoch).toHaveBeenCalledWith(EpochNumber(2));
    });

    it('fails if there is an attestation from a non-committee member', async () => {
      const badSigner = Secp256k1Signer.random();
      const checkpoint = await makeCheckpoint([...signers, badSigner], [...committee, badSigner.address]);
      const result = await validateCheckpointAttestations(
        toValidationInput(checkpoint),
        epochCache,
        constants,
        TEST_COORDINATION_SIGNATURE_CONTEXT,
        logger,
      );
      assert(!result.valid);
      assert(result.reason === 'invalid-attestation');
      expect(result.checkpoint.checkpointNumber).toEqual(checkpoint.checkpoint.number);
      expect(result.checkpoint.archive.toString()).toEqual(checkpoint.checkpoint.archive.root.toString());
      expect(result.committee).toEqual(committee);
      expect(result.invalidIndex).toBe(5); // The bad signer is at index 5
    });

    it('fails if there is an empty attestation', async () => {
      const checkpoint = await makeCheckpoint(signers.slice(0, 4), committee);
      checkpoint.attestations[1] = new CommitteeAttestation(EthAddress.ZERO, Signature.empty());
      const result = await validateCheckpointAttestations(
        toValidationInput(checkpoint),
        epochCache,
        constants,
        TEST_COORDINATION_SIGNATURE_CONTEXT,
        logger,
      );
      assert(!result.valid);
      assert(result.reason === 'invalid-attestation');
      expect(result.checkpoint.checkpointNumber).toEqual(checkpoint.checkpoint.number);
      expect(result.checkpoint.archive.toString()).toEqual(checkpoint.checkpoint.archive.root.toString());
      expect(result.committee).toEqual(committee);
      expect(result.invalidIndex).toBe(1); // The empty attestation is at index 1
    });

    it('fails if there is an attestation with an invalid signature', async () => {
      const checkpoint = await makeCheckpoint(signers.slice(0, 4), committee);
      // Create an invalid signature that will fail curve point recovery with "Point is not on curve: Cannot find square root"
      // r = curve_order - 1, s = 1
      const invalidR = Buffer32.fromBuffer(
        Buffer.from('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364140', 'hex'),
      );
      const invalidS = Buffer32.fromBuffer(
        Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex'),
      );
      const invalidSig = new Signature(invalidR, invalidS, 27);
      checkpoint.attestations[0] = new CommitteeAttestation(EthAddress.ZERO, invalidSig);

      // Verify that the invalid signature is detected
      const attestations = getAttestationInfoFromCheckpoint(
        toValidationInput(checkpoint),
        TEST_COORDINATION_SIGNATURE_CONTEXT,
      );
      expect(attestations[0].status).toBe('invalid-signature');

      const result = await validateCheckpointAttestations(
        toValidationInput(checkpoint),
        epochCache,
        constants,
        TEST_COORDINATION_SIGNATURE_CONTEXT,
        logger,
      );
      assert(!result.valid);
      assert(result.reason === 'invalid-attestation');
      expect(result.checkpoint.checkpointNumber).toEqual(checkpoint.checkpoint.number);
      expect(result.checkpoint.archive.toString()).toEqual(checkpoint.checkpoint.archive.root.toString());
      expect(result.committee).toEqual(committee);
      expect(result.invalidIndex).toBe(0);
    });

    it('fails if an attestation signature has a high-s value (malleable signature)', async () => {
      const checkpoint = await makeCheckpoint(signers.slice(0, 4), committee);

      // Flip the signature at index 2 to give it a high-s value
      const original = checkpoint.attestations[2];
      const flipped = flipSignature(original.signature);
      checkpoint.attestations[2] = new CommitteeAttestation(original.address, flipped);

      // Verify the flipped signature is detected as invalid
      const attestations = getAttestationInfoFromCheckpoint(
        toValidationInput(checkpoint),
        TEST_COORDINATION_SIGNATURE_CONTEXT,
      );
      expect(attestations[2].status).toBe('invalid-signature');

      const result = await validateCheckpointAttestations(
        toValidationInput(checkpoint),
        epochCache,
        constants,
        TEST_COORDINATION_SIGNATURE_CONTEXT,
        logger,
      );
      assert(!result.valid);
      assert(result.reason === 'invalid-attestation');
      expect(result.checkpoint.checkpointNumber).toEqual(checkpoint.checkpoint.number);
      expect(result.checkpoint.archive.toString()).toEqual(checkpoint.checkpoint.archive.root.toString());
      expect(result.committee).toEqual(committee);
      expect(result.invalidIndex).toBe(2);
    });

    it('reports correct index when invalid attestation follows provided address', async () => {
      const checkpoint = await makeCheckpoint(signers.slice(0, 3), committee);

      // Create an attestation with a provided address (index 0)
      checkpoint.attestations[0] = new CommitteeAttestation(signers[0].address, Signature.empty());

      // Create an invalid signature at index 1 - this should be reported as invalid at index 1, not 0
      checkpoint.attestations[1] = new CommitteeAttestation(EthAddress.ZERO, Signature.random());

      // Index 2 is a valid attestation from signers[2]

      const result = await validateCheckpointAttestations(
        toValidationInput(checkpoint),
        epochCache,
        constants,
        TEST_COORDINATION_SIGNATURE_CONTEXT,
        logger,
      );
      assert(!result.valid);
      assert(result.reason === 'invalid-attestation');
      expect(result.invalidIndex).toBe(1); // Should be 1 (the original index), not 0
    });

    it('returns false if insufficient attestations', async () => {
      const checkpoint = await makeCheckpoint(signers.slice(0, 2), committee);
      const result = await validateCheckpointAttestations(
        toValidationInput(checkpoint),
        epochCache,
        constants,
        TEST_COORDINATION_SIGNATURE_CONTEXT,
        logger,
      );
      assert(!result.valid);
      expect(result.reason).toBe('insufficient-attestations');
      expect(result.checkpoint.checkpointNumber).toEqual(checkpoint.checkpoint.number);
      expect(result.checkpoint.archive.toString()).toEqual(checkpoint.checkpoint.archive.root.toString());
      expect(result.committee).toEqual(committee);
    });

    it('returns true if all attestations are valid and sufficient', async () => {
      const checkpoint = await makeCheckpoint(signers.slice(0, 4), committee);
      const result = await validateCheckpointAttestations(
        toValidationInput(checkpoint),
        epochCache,
        constants,
        TEST_COORDINATION_SIGNATURE_CONTEXT,
        logger,
      );
      expect(result.valid).toBe(true);
    });

    it('fails if attestation ordering does not match committee ordering', async () => {
      // Create a checkpoint with attestations in the correct order
      const checkpoint = await makeCheckpoint(signers.slice(0, 4), committee);

      // Swap two attestations to create incorrect ordering
      // This simulates an attacker trying to reorder attestations
      const temp = checkpoint.attestations[1];
      checkpoint.attestations[1] = checkpoint.attestations[2];
      checkpoint.attestations[2] = temp;

      const result = await validateCheckpointAttestations(
        toValidationInput(checkpoint),
        epochCache,
        constants,
        TEST_COORDINATION_SIGNATURE_CONTEXT,
        logger,
      );
      assert(!result.valid);
      assert(result.reason === 'invalid-attestation');
      expect(result.checkpoint.checkpointNumber).toEqual(checkpoint.checkpoint.number);
      expect(result.checkpoint.archive.toString()).toEqual(checkpoint.checkpoint.archive.root.toString());
      expect(result.committee).toEqual(committee);
      // The first mismatched attestation should be at index 1
      expect(result.invalidIndex).toBe(1);
    });

    it('validates a checkpoint if escape hatch is open', async () => {
      epochCache.isEscapeHatchOpen.mockResolvedValue(true);
      const checkpoint = await makeCheckpoint(signers, committee);
      const result = await validateCheckpointAttestations(
        toValidationInput(checkpoint),
        epochCache,
        constants,
        TEST_COORDINATION_SIGNATURE_CONTEXT,
        logger,
      );
      expect(result.valid).toBe(true);
      expect(epochCache.isEscapeHatchOpen).toHaveBeenCalledWith(EpochNumber(0));
    });
  });
});
