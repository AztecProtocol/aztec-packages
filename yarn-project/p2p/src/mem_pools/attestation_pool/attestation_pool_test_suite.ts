import { SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { BlockProposal, CheckpointAttestation, CheckpointProposal } from '@aztec/stdlib/p2p';
import { makeBlockProposal, makeCheckpointProposal, makeL2BlockHeader } from '@aztec/stdlib/testing';

import type { AttestationPool } from './attestation_pool.js';
import { MAX_PROPOSALS_PER_SLOT } from './kv_attestation_pool.js';
import { mockCheckpointAttestation } from './mocks.js';

const NUMBER_OF_SIGNERS_PER_TEST = 4;

export function describeAttestationPool(getAttestationPool: () => AttestationPool) {
  let ap: AttestationPool;
  let signers: Secp256k1Signer[];

  beforeEach(() => {
    ap = getAttestationPool();
    signers = Array.from({ length: NUMBER_OF_SIGNERS_PER_TEST }, () => Secp256k1Signer.random());
  });

  const createCheckpointAttestationsForSlot = (slotNumber: number, archive?: Fr) => {
    const archiveToUse = archive ?? Fr.random();
    return signers.map(signer => mockCheckpointAttestation(signer, slotNumber, archiveToUse));
  };

  const mockBlockProposalForPool = (
    signer: Secp256k1Signer,
    slotNumber: number,
    archive: Fr = Fr.random(),
  ): Promise<BlockProposal> => {
    const header = makeL2BlockHeader(1, 2, slotNumber);
    return makeBlockProposal({
      signer,
      blockHeader: header,
      archiveRoot: archive,
    });
  };

  // Compare checkpoint attestations buffers
  // Using array containing as the kv store does not respect insertion order
  const compareCheckpointAttestations = (a1: CheckpointAttestation[], a2: CheckpointAttestation[]) => {
    const a1Buffer = a1.map(attestation => attestation.toBuffer());
    const a2Buffer = a2.map(attestation => attestation.toBuffer());
    expect(a1Buffer.length).toBe(a2Buffer.length);
    expect(a1Buffer).toEqual(expect.arrayContaining(a2Buffer));
  };

  describe('CheckpointAttestation', () => {
    it('should add attestations to pool', async () => {
      const slotNumber = 420;
      const archive = Fr.random();
      const attestations = signers.slice(0, -1).map(signer => mockCheckpointAttestation(signer, slotNumber, archive));

      await ap.addCheckpointAttestations(attestations);

      const retrievedAttestations = await ap.getCheckpointAttestationsForSlotAndProposal(
        SlotNumber(slotNumber),
        archive.toString(),
      );
      expect(retrievedAttestations.length).toBe(attestations.length);
      compareCheckpointAttestations(retrievedAttestations, attestations);

      // Check hasCheckpointAttestation for added attestations
      for (const attestation of attestations) {
        expect(await ap.hasCheckpointAttestation(attestation)).toBe(true);
      }

      const retrievedAttestationsForSlot = await ap.getCheckpointAttestationsForSlot(SlotNumber(slotNumber));
      expect(retrievedAttestationsForSlot.length).toBe(attestations.length);
      compareCheckpointAttestations(retrievedAttestationsForSlot, attestations);

      // Add another one
      const newAttestation = mockCheckpointAttestation(signers[NUMBER_OF_SIGNERS_PER_TEST - 1], slotNumber, archive);
      await ap.addCheckpointAttestations([newAttestation]);
      const retrievedAttestationsAfterAdd = await ap.getCheckpointAttestationsForSlotAndProposal(
        SlotNumber(slotNumber),
        archive.toString(),
      );
      expect(retrievedAttestationsAfterAdd.length).toBe(attestations.length + 1);
      compareCheckpointAttestations(retrievedAttestationsAfterAdd, [...attestations, newAttestation]);
      expect(await ap.hasCheckpointAttestation(newAttestation)).toBe(true);
      const retrievedAttestationsForSlotAfterAdd = await ap.getCheckpointAttestationsForSlot(SlotNumber(slotNumber));
      expect(retrievedAttestationsForSlotAfterAdd.length).toBe(attestations.length + 1);
      compareCheckpointAttestations(retrievedAttestationsForSlotAfterAdd, [...attestations, newAttestation]);

      // Delete by slot
      await ap.deleteCheckpointAttestationsOlderThan(SlotNumber(slotNumber + 1));

      const retreivedAttestationsAfterDelete = await ap.getCheckpointAttestationsForSlotAndProposal(
        SlotNumber(slotNumber),
        archive.toString(),
      );
      expect(retreivedAttestationsAfterDelete.length).toBe(0);
      // Check hasCheckpointAttestation after deletion
      for (const attestation of attestations) {
        expect(await ap.hasCheckpointAttestation(attestation)).toBe(false);
      }
      expect(await ap.hasCheckpointAttestation(newAttestation)).toBe(false);
    });

    it('should handle duplicate proposals in a slot', async () => {
      const slotNumber = 420;
      const archive = Fr.random();

      // Use the same signer for all attestations
      const attestations: CheckpointAttestation[] = [];
      const signer = signers[0];
      for (let i = 0; i < NUMBER_OF_SIGNERS_PER_TEST; i++) {
        attestations.push(mockCheckpointAttestation(signer, slotNumber, archive));
      }

      // Add them to store and check we end up with only one
      await ap.addCheckpointAttestations(attestations);

      const retreivedAttestations = await ap.getCheckpointAttestationsForSlotAndProposal(
        SlotNumber(slotNumber),
        archive.toString(),
      );
      expect(retreivedAttestations.length).toBe(1);
      expect(retreivedAttestations[0].toBuffer()).toEqual(attestations[0].toBuffer());
      expect(retreivedAttestations[0].getSender()?.toString()).toEqual(signer.address.toString());

      // Try adding them on another operation and check they are still not duplicated
      await ap.addCheckpointAttestations([attestations[0]]);
      expect(
        await ap.getCheckpointAttestationsForSlotAndProposal(SlotNumber(slotNumber), archive.toString()),
      ).toHaveLength(1);
    });

    it('should store attestations by differing slot', async () => {
      const slotNumbers = [1, 2, 3, 4];
      const attestations = signers.map((signer, i) => mockCheckpointAttestation(signer, slotNumbers[i]));

      await ap.addCheckpointAttestations(attestations);

      for (const attestation of attestations) {
        const slot = attestation.payload.header.slotNumber;
        const archive = attestation.archive.toString();

        const retreivedAttestations = await ap.getCheckpointAttestationsForSlotAndProposal(slot, archive);
        expect(retreivedAttestations.length).toBe(1);
        expect(retreivedAttestations[0].toBuffer()).toEqual(attestation.toBuffer());
        expect(retreivedAttestations[0].payload.header.slotNumber).toEqual(slot);
      }
    });

    it('should store attestations by differing slot and archive', async () => {
      const slotNumbers = [1, 1, 2, 3];
      const archives = [Fr.random(), Fr.random(), Fr.random(), Fr.random()];
      const attestations = signers.map((signer, i) => mockCheckpointAttestation(signer, slotNumbers[i], archives[i]));

      await ap.addCheckpointAttestations(attestations);

      for (const attestation of attestations) {
        const slot = attestation.payload.header.slotNumber;
        const proposalId = attestation.archive.toString();

        const retreivedAttestations = await ap.getCheckpointAttestationsForSlotAndProposal(slot, proposalId);
        expect(retreivedAttestations.length).toBe(1);
        expect(retreivedAttestations[0].toBuffer()).toEqual(attestation.toBuffer());
        expect(retreivedAttestations[0].payload.header.slotNumber).toEqual(slot);
      }
    });

    it('should delete attestations older than a given slot', async () => {
      const slotNumbers = [1, 2, 3, 69, 72, 74, 88, 420];
      const attestations = (
        await Promise.all(slotNumbers.map(slotNumber => createCheckpointAttestationsForSlot(slotNumber)))
      ).flat();
      const proposalId = attestations[0].archive.toString();

      await ap.addCheckpointAttestations(attestations);

      const attestationsForSlot1 = await ap.getCheckpointAttestationsForSlotAndProposal(SlotNumber(1), proposalId);
      expect(attestationsForSlot1.length).toBe(signers.length);

      await ap.deleteCheckpointAttestationsOlderThan(SlotNumber(73));

      const attestationsForSlot1AfterDelete = await ap.getCheckpointAttestationsForSlotAndProposal(
        SlotNumber(1),
        proposalId,
      );
      expect(attestationsForSlot1AfterDelete.length).toBe(0);
    });
  });

  describe('BlockProposal in attestation pool', () => {
    it('should add and retrieve block proposal', async () => {
      const slotNumber = 420;
      const archive = Fr.random();
      const proposal = await mockBlockProposalForPool(signers[0], slotNumber, archive);
      const proposalId = proposal.archive.toString();

      await ap.addBlockProposal(proposal);

      const retrievedProposal = await ap.getBlockProposal(proposalId);

      expect(retrievedProposal).toBeDefined();
      expect(retrievedProposal!).toEqual(proposal);

      // Check hasBlockProposal with both id and object
      expect(await ap.hasBlockProposal(proposalId)).toBe(true);
      expect(await ap.hasBlockProposal(proposal)).toBe(true);
    });

    it('should return undefined for non-existent block proposal', async () => {
      const nonExistentId = Fr.random().toString();
      const retrievedProposal = await ap.getBlockProposal(nonExistentId);
      expect(retrievedProposal).toBeUndefined();

      // Check hasBlockProposal returns false for non-existent proposal
      expect(await ap.hasBlockProposal(nonExistentId)).toBe(false);
    });

    it('should update block proposal if added twice with same id', async () => {
      const slotNumber = 420;
      const archive = Fr.random();
      const proposal1 = await mockBlockProposalForPool(signers[0], slotNumber, archive);
      const proposalId = proposal1.archive.toString();

      await ap.addBlockProposal(proposal1);

      // Create a new proposal with same archive but different signer
      const proposal2 = await mockBlockProposalForPool(signers[1], slotNumber, archive);

      await ap.addBlockProposal(proposal2);

      const retrievedProposal = await ap.getBlockProposal(proposalId);
      expect(retrievedProposal).toBeDefined();
      // Should have the second proposal
      expect(retrievedProposal!.toBuffer()).toEqual(proposal2.toBuffer());
      expect(retrievedProposal!.getSender()?.toString()).toBe(signers[1].address.toString());
    });

    it('should handle block proposals with different slots and same archive', async () => {
      const archive = Fr.random();
      const proposal1 = await mockBlockProposalForPool(signers[0], 100, archive);
      const proposal2 = await mockBlockProposalForPool(signers[1], 200, archive);
      const proposalId = archive.toString();

      await ap.addBlockProposal(proposal1);
      await ap.addBlockProposal(proposal2);

      // Should get the latest one added
      const retrievedProposal = await ap.getBlockProposal(proposalId);
      expect(retrievedProposal).toBeDefined();
      expect(retrievedProposal!.toBuffer()).toEqual(proposal2.toBuffer());
      expect(retrievedProposal!.slotNumber).toBe(SlotNumber(200));
    });
  });

  describe('CheckpointProposal in attestation pool', () => {
    const mockCheckpointProposalForPool = (
      signer: Secp256k1Signer,
      slotNumber: number,
      archive: Fr = Fr.random(),
    ): Promise<CheckpointProposal> => {
      const header = makeL2BlockHeader(1, 2, slotNumber);
      return makeCheckpointProposal({
        signer,
        checkpointHeader: header.toCheckpointHeader(),
        archiveRoot: archive,
        lastBlock: { blockHeader: header },
      });
    };

    it('should add and retrieve checkpoint proposal as core (without lastBlock)', async () => {
      const slotNumber = 420;
      const archive = Fr.random();
      const proposal = await mockCheckpointProposalForPool(signers[0], slotNumber, archive);
      const proposalId = proposal.archive.toString();

      await ap.addCheckpointProposal(proposal);

      const retrievedProposal = await ap.getCheckpointProposal(proposalId);

      expect(retrievedProposal).toBeDefined();
      // Should return core version (without lastBlock)
      expect(retrievedProposal!.toBuffer()).toEqual(proposal.toCore().toBuffer());

      // Check hasCheckpointProposal with both id and object
      expect(await ap.hasCheckpointProposal(proposalId)).toBe(true);
      expect(await ap.hasCheckpointProposal(proposal)).toBe(true);
    });

    it('should extract and store block proposal when adding checkpoint proposal with lastBlock', async () => {
      const slotNumber = 420;
      const archive = Fr.random();
      const proposal = await mockCheckpointProposalForPool(signers[0], slotNumber, archive);
      const proposalId = proposal.archive.toString();

      // Verify the proposal has a lastBlock
      const expectedBlockProposal = proposal.getBlockProposal();
      expect(expectedBlockProposal).toBeDefined();

      await ap.addCheckpointProposal(proposal);

      // The block proposal should be stored separately and retrievable
      const retrievedBlockProposal = await ap.getBlockProposal(proposalId);
      expect(retrievedBlockProposal).toBeDefined();
      expect(retrievedBlockProposal!.archive.toString()).toBe(archive.toString());
      expect(retrievedBlockProposal!.blockHeader.toBuffer()).toEqual(expectedBlockProposal!.blockHeader.toBuffer());
    });

    it('should not store block proposal when checkpoint proposal has no lastBlock', async () => {
      const slotNumber = 420;
      const archive = Fr.random();
      const header = makeL2BlockHeader(1, 2, slotNumber);
      // Create a checkpoint proposal WITHOUT lastBlock
      const proposal = await makeCheckpointProposal({
        signer: signers[0],
        checkpointHeader: header.toCheckpointHeader(),
        archiveRoot: archive,
        // No lastBlock
      });
      const proposalId = proposal.archive.toString();

      await ap.addCheckpointProposal(proposal);

      // The checkpoint proposal should be stored
      const retrievedCheckpointProposal = await ap.getCheckpointProposal(proposalId);
      expect(retrievedCheckpointProposal).toBeDefined();

      // But no block proposal should be stored (archive key won't have a block proposal)
      const retrievedBlockProposal = await ap.getBlockProposal(proposalId);
      expect(retrievedBlockProposal).toBeUndefined();
    });

    it('should return undefined for non-existent checkpoint proposal', async () => {
      const nonExistentId = Fr.random().toString();
      const retrievedProposal = await ap.getCheckpointProposal(nonExistentId);
      expect(retrievedProposal).toBeUndefined();

      // Check hasCheckpointProposal returns false for non-existent proposal
      expect(await ap.hasCheckpointProposal(nonExistentId)).toBe(false);
    });

    it('should update checkpoint proposal if added twice with same id', async () => {
      const slotNumber = 420;
      const archive = Fr.random();
      const proposal1 = await mockCheckpointProposalForPool(signers[0], slotNumber, archive);
      const proposalId = proposal1.archive.toString();

      await ap.addCheckpointProposal(proposal1);

      // Create a new proposal with same archive but different signer
      const proposal2 = await mockCheckpointProposalForPool(signers[1], slotNumber, archive);

      await ap.addCheckpointProposal(proposal2);

      const retrievedProposal = await ap.getCheckpointProposal(proposalId);
      expect(retrievedProposal).toBeDefined();
      // Should have the second proposal (as core)
      expect(retrievedProposal!.toBuffer()).toEqual(proposal2.toCore().toBuffer());
      expect(retrievedProposal!.getSender()?.toString()).toBe(signers[1].address.toString());
    });

    it('should throw ProposalSlotCapExceededError when exceeding capacity', async () => {
      const slotNumber = 420;

      // Add MAX_PROPOSALS_PER_SLOT proposals
      for (let i = 0; i < MAX_PROPOSALS_PER_SLOT; i++) {
        const proposal = await mockCheckpointProposalForPool(signers[i % NUMBER_OF_SIGNERS_PER_TEST], slotNumber);
        await ap.addCheckpointProposal(proposal);
      }

      // The next proposal should throw
      const extraProposal = await mockCheckpointProposalForPool(signers[0], slotNumber);
      await expect(ap.addCheckpointProposal(extraProposal)).rejects.toThrow('Maximum checkpoint proposals per slot');
    });
  });
}
