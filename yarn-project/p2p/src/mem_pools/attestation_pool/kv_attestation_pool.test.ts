import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { makeBlockProposal, makeL2BlockHeader } from '@aztec/stdlib/testing';

import { ProposalSlotCapExceededError } from '../../errors/attestation-pool.error.js';
import { describeAttestationPool } from './attestation_pool_test_suite.js';
import { ATTESTATION_CAP_BUFFER, KvAttestationPool, MAX_PROPOSALS_PER_SLOT } from './kv_attestation_pool.js';
import { mockAttestation } from './mocks.js';

describe('KV Attestation Pool', () => {
  let kvAttestationPool: KvAttestationPool;
  let store: AztecAsyncKVStore;

  beforeEach(async () => {
    store = await openTmpStore('test');
    kvAttestationPool = new KvAttestationPool(store);
  });

  afterEach(() => store.close());

  describeAttestationPool(() => kvAttestationPool);

  describe('BlockProposal cap exceeded', () => {
    it('should throw when adding more than capped unique proposals for the same slot; duplicates are idempotent', async () => {
      const slotNumber = 100;
      const header = makeL2BlockHeader(1, 2, slotNumber);

      // Add 1 proposal and re-add it (duplicate) → should not count against cap and not throw
      const p0 = makeBlockProposal({ header, archive: Fr.random() });
      await kvAttestationPool.addBlockProposal(p0);
      await kvAttestationPool.addBlockProposal(p0); // idempotent

      // Add up to the cap: add (MAX_PROPOSALS_PER_SLOT - 1) more unique proposals
      for (let i = 0; i < MAX_PROPOSALS_PER_SLOT - 1; i++) {
        const p = makeBlockProposal({ header, archive: Fr.random() });
        await kvAttestationPool.addBlockProposal(p);
      }

      // Adding one more unique proposal for same slot should throw (exceeds cap)
      const overflow = makeBlockProposal({ header, archive: Fr.random() });
      await expect(kvAttestationPool.addBlockProposal(overflow)).rejects.toBeInstanceOf(ProposalSlotCapExceededError);
    });
  });

  describe('Attestation cap exceeded', () => {
    it('should cap unique attestations per (slot, proposalId) at committeeSize + buffer', async () => {
      const slotNumber = 100;
      const archive = Fr.random();

      // Committee size and buffer (buffer is enforced inside the pool; here we pass only committeeSize)
      const committeeSize = 5;
      const buffer = ATTESTATION_CAP_BUFFER;
      const limit = committeeSize + buffer;

      // Create 'limit' distinct attestations for the same (slot, proposalId)
      const signers = Array.from({ length: limit }, () => Secp256k1Signer.random());
      const attestations = signers.map(s => mockAttestation(s, slotNumber, archive));
      await kvAttestationPool.addAttestations(attestations);

      // We should now be at cap
      expect(
        await kvAttestationPool.hasReachedAttestationCap(BigInt(slotNumber), archive.toString(), committeeSize),
      ).toBe(true);

      // A new attestation from a new signer should not be accepted (per validation helper semantics)
      const extra = mockAttestation(Secp256k1Signer.random(), slotNumber, archive);
      expect(await kvAttestationPool.canAddAttestation(extra, committeeSize)).toBe(false);

      // Re-adding an existing attestation should be allowed
      expect(await kvAttestationPool.canAddAttestation(attestations[0], committeeSize)).toBe(true);
    });
  });
});
