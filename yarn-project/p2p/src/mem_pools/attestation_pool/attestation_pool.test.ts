import { SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { makeBlockHeader, makeBlockProposal } from '@aztec/stdlib/testing';

import { AttestationPool, MAX_ATTESTATIONS_PER_SLOT_AND_SIGNER } from './attestation_pool.js';
import { describeAttestationPool } from './attestation_pool_test_suite.js';
import { mockCheckpointAttestation } from './mocks.js';

describe('Attestation Pool', () => {
  let attestationPool: AttestationPool;
  let store: AztecAsyncKVStore;

  beforeEach(async () => {
    store = await openTmpStore('test');
    attestationPool = new AttestationPool(store);
  });

  afterEach(() => store.close());

  describeAttestationPool(() => attestationPool);

  describe('BlockProposal behavior', () => {
    it('should allow adding block proposals up to position cap', async () => {
      const slotNumber = 100;
      const header = makeBlockHeader(1, { slotNumber: SlotNumber(slotNumber) });

      // Add 1 proposal and re-add it (duplicate) -> should return alreadyExists
      const p0 = await makeBlockProposal({ blockHeader: header, archiveRoot: Fr.random() });
      const result0 = await attestationPool.tryAddBlockProposal(p0);
      expect(result0.added).toBe(true);

      const result0Dup = await attestationPool.tryAddBlockProposal(p0);
      expect(result0Dup.added).toBe(false);
      expect(result0Dup.alreadyExists).toBe(true);
    });
  });

  describe('Checkpoint Attestation behavior', () => {
    it('should add attestations from multiple signers for the same proposal', async () => {
      const slotNumber = 100;
      const archive = Fr.random();

      // Create distinct checkpoint attestations for the same (slot, proposalId) from different signers
      const numSigners = 10;
      const signers = Array.from({ length: numSigners }, () => Secp256k1Signer.random());
      const attestations = signers.map(s => mockCheckpointAttestation(s, slotNumber, archive));

      // Add each attestation using tryAddCheckpointAttestation
      // count is the number of attestations by this signer for this slot
      for (let i = 0; i < attestations.length; i++) {
        const result = await attestationPool.tryAddCheckpointAttestation(attestations[i]);
        expect(result.added).toBe(true);
        expect(result.count).toBe(1); // First attestation from this signer for this slot
      }

      // Re-adding an existing attestation should return alreadyExists
      const existingResult = await attestationPool.tryAddCheckpointAttestation(attestations[0]);
      expect(existingResult.added).toBe(false);
      expect(existingResult.alreadyExists).toBe(true);
      expect(existingResult.count).toBe(1); // This signer has 1 attestation for this slot
    });
  });

  describe('Duplicate attestation detection (equivocation)', () => {
    it('should detect duplicate attestations from same signer for same slot but different proposals', async () => {
      const slotNumber = 100;
      const signer = Secp256k1Signer.random();

      // First attestation - should succeed with count=1
      const archive1 = Fr.random();
      const attestation1 = mockCheckpointAttestation(signer, slotNumber, archive1);
      const result1 = await attestationPool.tryAddCheckpointAttestation(attestation1);
      expect(result1.added).toBe(true);
      expect(result1.count).toBe(1); // Attestations from this signer

      // Second attestation from same signer for same slot but different proposal (equivocation!)
      const archive2 = Fr.random();
      const attestation2 = mockCheckpointAttestation(signer, slotNumber, archive2);
      const result2 = await attestationPool.tryAddCheckpointAttestation(attestation2);
      expect(result2.added).toBe(true);
      expect(result2.count).toBe(2); // This is the first duplicate - triggers slashing

      // Third attestation from same signer (if we want to track more)
      const archive3 = Fr.random();
      const attestation3 = mockCheckpointAttestation(signer, slotNumber, archive3);
      const result3 = await attestationPool.tryAddCheckpointAttestation(attestation3);
      expect(result3.added).toBe(true);
      expect(result3.count).toBe(3); // Attestations from this signer
    });

    it('should reject attestations when signer exceeds per-slot cap', async () => {
      const slotNumber = 100;
      const signer = Secp256k1Signer.random();

      // Add attestations up to the per-signer-per-slot cap
      for (let i = 0; i < MAX_ATTESTATIONS_PER_SLOT_AND_SIGNER; i++) {
        const archive = Fr.random();
        const attestation = mockCheckpointAttestation(signer, slotNumber, archive);
        const result = await attestationPool.tryAddCheckpointAttestation(attestation);
        expect(result.added).toBe(true);
        expect(result.count).toBe(i + 1); // Attestations from this signer
      }

      // One more attestation from the same signer should be rejected
      const extraArchive = Fr.random();
      const extraAttestation = mockCheckpointAttestation(signer, slotNumber, extraArchive);
      const extraResult = await attestationPool.tryAddCheckpointAttestation(extraAttestation);
      expect(extraResult.added).toBe(false);
      expect(extraResult.alreadyExists).toBe(false);
      expect(extraResult.count).toBe(MAX_ATTESTATIONS_PER_SLOT_AND_SIGNER); // Attestations from this signer
    });

    it('should not detect duplicates for attestations from different signers', async () => {
      const slotNumber = 100;
      const archive = Fr.random();

      // First signer
      const signer1 = Secp256k1Signer.random();
      const attestation1 = mockCheckpointAttestation(signer1, slotNumber, archive);
      const result1 = await attestationPool.tryAddCheckpointAttestation(attestation1);
      expect(result1.added).toBe(true);
      expect(result1.count).toBe(1); // Attestations from this signer

      // Second signer for same slot and proposal - not a duplicate, just another attestation
      const signer2 = Secp256k1Signer.random();
      const attestation2 = mockCheckpointAttestation(signer2, slotNumber, archive);
      const result2 = await attestationPool.tryAddCheckpointAttestation(attestation2);
      expect(result2.added).toBe(true);
      expect(result2.count).toBe(1); // Different signer, so count is 1
    });

    it('should not detect duplicates for attestations from same signer but different slots', async () => {
      const signer = Secp256k1Signer.random();
      const archive = Fr.random();

      // Attestation for slot 100
      const attestation1 = mockCheckpointAttestation(signer, 100, archive);
      const result1 = await attestationPool.tryAddCheckpointAttestation(attestation1);
      expect(result1.added).toBe(true);
      expect(result1.count).toBe(1); // Attestations from this signer for slot 100

      // Attestation for slot 101 - different slot, not a duplicate
      const attestation2 = mockCheckpointAttestation(signer, 101, archive);
      const result2 = await attestationPool.tryAddCheckpointAttestation(attestation2);
      expect(result2.added).toBe(true);
      expect(result2.count).toBe(1); // Different slot, so count is 1
    });

    it('should clean up per-slot-signer index when deleting old data', async () => {
      const signer = Secp256k1Signer.random();

      // Add attestations for slot 100 (to be deleted)
      const attestation1 = mockCheckpointAttestation(signer, 100, Fr.random());
      await attestationPool.tryAddCheckpointAttestation(attestation1);
      const attestation2 = mockCheckpointAttestation(signer, 100, Fr.random());
      await attestationPool.tryAddCheckpointAttestation(attestation2);

      // Add attestation for slot 200 (to be kept)
      const attestation3 = mockCheckpointAttestation(signer, 200, Fr.random());
      await attestationPool.tryAddCheckpointAttestation(attestation3);

      // Delete data older than slot 150
      await attestationPool.deleteOlderThan(SlotNumber(150));

      // Now adding attestations for slot 100 should start fresh
      const newAttestation = mockCheckpointAttestation(signer, 100, Fr.random());
      const result = await attestationPool.tryAddCheckpointAttestation(newAttestation);
      expect(result.added).toBe(true);
      expect(result.count).toBe(1); // Attestations from this signer for this slot (index was cleaned up)

      // Slot 200 should still have 1 attestation from this signer
      const slotNumber200Attestation = mockCheckpointAttestation(signer, 200, Fr.random());
      const result200 = await attestationPool.tryAddCheckpointAttestation(slotNumber200Attestation);
      expect(result200.added).toBe(true);
      expect(result200.count).toBe(2); // Original + new from same signer
    });
  });
});
