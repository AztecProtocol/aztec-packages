import { SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { makeBlockHeader, makeBlockProposal } from '@aztec/stdlib/testing';

import { ATTESTATION_CAP_BUFFER, AttestationPool } from './attestation_pool.js';
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

  describe('Checkpoint Attestation cap exceeded', () => {
    it('should cap unique checkpoint attestations per (slot, proposalId) at committeeSize + buffer', async () => {
      const slotNumber = 100;
      const archive = Fr.random();

      // Committee size and buffer (buffer is enforced inside the pool; here we pass only committeeSize)
      const committeeSize = 5;
      const buffer = ATTESTATION_CAP_BUFFER;
      const limit = committeeSize + buffer;

      // Create 'limit' distinct checkpoint attestations for the same (slot, proposalId)
      const signers = Array.from({ length: limit }, () => Secp256k1Signer.random());
      const attestations = signers.map(s => mockCheckpointAttestation(s, slotNumber, archive));

      // Add each attestation using tryAddCheckpointAttestation
      for (let i = 0; i < attestations.length; i++) {
        const result = await attestationPool.tryAddCheckpointAttestation(attestations[i], committeeSize);
        expect(result.added).toBe(true);
        expect(result.totalForPosition).toBe(i + 1);
      }

      // A new attestation from a new signer should not be added (cap reached)
      const extra = mockCheckpointAttestation(Secp256k1Signer.random(), slotNumber, archive);
      const extraResult = await attestationPool.tryAddCheckpointAttestation(extra, committeeSize);
      expect(extraResult.added).toBe(false);
      expect(extraResult.alreadyExists).toBe(false);
      expect(extraResult.totalForPosition).toBe(limit);

      // Re-adding an existing attestation should return alreadyExists
      const existingResult = await attestationPool.tryAddCheckpointAttestation(attestations[0], committeeSize);
      expect(existingResult.added).toBe(false);
      expect(existingResult.alreadyExists).toBe(true);
    });
  });
});
