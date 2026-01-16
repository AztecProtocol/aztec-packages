import { SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { makeBlockHeader, makeBlockProposal } from '@aztec/stdlib/testing';

import { describeAttestationPool } from './attestation_pool_test_suite.js';
import { ATTESTATION_CAP_BUFFER, KvAttestationPool, MAX_PROPOSALS_PER_SLOT } from './kv_attestation_pool.js';
import { mockCheckpointAttestation } from './mocks.js';

describe('KV Attestation Pool', () => {
  let kvAttestationPool: KvAttestationPool;
  let store: AztecAsyncKVStore;

  beforeEach(async () => {
    store = await openTmpStore('test');
    kvAttestationPool = new KvAttestationPool(store);
  });

  afterEach(() => store.close());

  describeAttestationPool(() => kvAttestationPool);

  describe('BlockProposal behavior', () => {
    it('should allow adding multiple block proposals for the same slot without cap', async () => {
      const slotNumber = 100;
      const header = makeBlockHeader(1, { slotNumber: SlotNumber(slotNumber) });

      // Add 1 proposal and re-add it (duplicate) → should be idempotent
      const p0 = await makeBlockProposal({ blockHeader: header, archiveRoot: Fr.random() });
      await kvAttestationPool.addBlockProposal(p0);
      await kvAttestationPool.addBlockProposal(p0); // idempotent

      // Add more unique proposals - all should succeed without cap
      for (let i = 0; i < MAX_PROPOSALS_PER_SLOT + 5; i++) {
        const p = await makeBlockProposal({ blockHeader: header, archiveRoot: Fr.random() });
        await kvAttestationPool.addBlockProposal(p);
      }

      // canAddProposal should always return true
      const overflow = await makeBlockProposal({ blockHeader: header, archiveRoot: Fr.random() });
      expect(await kvAttestationPool.canAddProposal(overflow)).toBe(true);
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
      await kvAttestationPool.addCheckpointAttestations(attestations);

      // We should now be at cap
      expect(
        await kvAttestationPool.hasReachedCheckpointAttestationCap(
          SlotNumber(slotNumber),
          archive.toString(),
          committeeSize,
        ),
      ).toBe(true);

      // A new attestation from a new signer should not be accepted (per validation helper semantics)
      const extra = mockCheckpointAttestation(Secp256k1Signer.random(), slotNumber, archive);
      expect(await kvAttestationPool.canAddCheckpointAttestation(extra, committeeSize)).toBe(false);

      // Re-adding an existing attestation should be allowed
      expect(await kvAttestationPool.canAddCheckpointAttestation(attestations[0], committeeSize)).toBe(true);
    });
  });
});
