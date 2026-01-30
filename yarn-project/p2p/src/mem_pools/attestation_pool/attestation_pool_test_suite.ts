import { IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { BlockProposal, CheckpointAttestation, CheckpointProposalCore } from '@aztec/stdlib/p2p';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import {
  makeBlockHeader,
  makeBlockProposal,
  makeCheckpointHeader,
  makeCheckpointProposal,
} from '@aztec/stdlib/testing';

import type { AttestationPool } from './attestation_pool.js';
import { MAX_PROPOSALS_PER_POSITION, MAX_PROPOSALS_PER_SLOT } from './kv_attestation_pool.js';
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
    const header = makeBlockHeader(1, { slotNumber: SlotNumber(slotNumber) });
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
      const retrievedAttestationsForSlotAfterAdd = await ap.getCheckpointAttestationsForSlot(SlotNumber(slotNumber));
      expect(retrievedAttestationsForSlotAfterAdd.length).toBe(attestations.length + 1);
      compareCheckpointAttestations(retrievedAttestationsForSlotAfterAdd, [...attestations, newAttestation]);

      // Delete by slot
      await ap.deleteOlderThan(SlotNumber(slotNumber + 1));

      const retreivedAttestationsAfterDelete = await ap.getCheckpointAttestationsForSlotAndProposal(
        SlotNumber(slotNumber),
        archive.toString(),
      );
      expect(retreivedAttestationsAfterDelete.length).toBe(0);
    });

    it('should handle duplicate proposals in a slot', async () => {
      const slotNumber = 420;
      const archive = Fr.random();
      const header = CheckpointHeader.random({ slotNumber: SlotNumber(slotNumber) });

      // Use the same signer and header for all attestations
      const attestations: CheckpointAttestation[] = [];
      const signer = signers[0];
      for (let i = 0; i < NUMBER_OF_SIGNERS_PER_TEST; i++) {
        attestations.push(mockCheckpointAttestation(signer, slotNumber, archive, header));
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

      await ap.deleteOlderThan(SlotNumber(73));

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

      const result = await ap.tryAddBlockProposal(proposal);

      expect(result.added).toBe(true);
      expect(result.alreadyExists).toBe(false);
      expect(result.totalForPosition).toBe(1);

      const retrievedProposal = await ap.getBlockProposal(proposalId);

      expect(retrievedProposal).toBeDefined();
      expect(retrievedProposal!).toEqual(proposal);
    });

    it('should return undefined for non-existent block proposal', async () => {
      const nonExistentId = Fr.random().toString();
      const retrievedProposal = await ap.getBlockProposal(nonExistentId);
      expect(retrievedProposal).toBeUndefined();
    });

    it('should return alreadyExists when adding proposal with same id', async () => {
      const slotNumber = 420;
      const archive = Fr.random();
      const proposal1 = await mockBlockProposalForPool(signers[0], slotNumber, archive);
      const proposalId = proposal1.archive.toString();

      const result1 = await ap.tryAddBlockProposal(proposal1);
      expect(result1.added).toBe(true);
      expect(result1.alreadyExists).toBe(false);

      // Create a new proposal with same archive but different signer
      const proposal2 = await mockBlockProposalForPool(signers[1], slotNumber, archive);

      const result2 = await ap.tryAddBlockProposal(proposal2);
      expect(result2.added).toBe(false);
      expect(result2.alreadyExists).toBe(true);

      // Should still have the first proposal
      const retrievedProposal = await ap.getBlockProposal(proposalId);
      expect(retrievedProposal).toBeDefined();
      expect(retrievedProposal!.toBuffer()).toEqual(proposal1.toBuffer());
      expect(retrievedProposal!.getSender()?.toString()).toBe(signers[0].address.toString());
    });
  });

  describe('CheckpointProposal in attestation pool', () => {
    const mockCheckpointProposalForPool = async (
      signer: Secp256k1Signer,
      slotNumber: number,
      archive: Fr = Fr.random(),
    ): Promise<CheckpointProposalCore> => {
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: SlotNumber(slotNumber) });
      const blockHeader = makeBlockHeader(1);
      const proposal = await makeCheckpointProposal({
        signer,
        checkpointHeader,
        archiveRoot: archive,
        lastBlock: { blockHeader },
      });
      // Return the core version since tryAddCheckpointProposal now takes CheckpointProposalCore
      return proposal.toCore();
    };

    it('should add and retrieve checkpoint proposal', async () => {
      const slotNumber = 420;
      const archive = Fr.random();
      const proposal = await mockCheckpointProposalForPool(signers[0], slotNumber, archive);
      const proposalId = proposal.archive.toString();

      const result = await ap.tryAddCheckpointProposal(proposal);

      expect(result.added).toBe(true);
      expect(result.alreadyExists).toBe(false);
      expect(result.totalForPosition).toBe(1);

      const retrievedProposal = await ap.getCheckpointProposal(proposalId);

      expect(retrievedProposal).toBeDefined();
      expect(retrievedProposal!.toBuffer()).toEqual(proposal.toBuffer());
    });

    it('should handle checkpoint proposal without lastBlock (caller extracts and adds block separately)', async () => {
      const slotNumber = 420;
      const archive = Fr.random();
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: SlotNumber(slotNumber) });
      // Create a checkpoint proposal WITHOUT lastBlock
      const proposal = await makeCheckpointProposal({
        signer: signers[0],
        checkpointHeader,
        archiveRoot: archive,
        // No lastBlock
      });
      const proposalId = proposal.archive.toString();

      // Add the checkpoint core - block extraction is now caller responsibility
      await ap.tryAddCheckpointProposal(proposal.toCore());

      // The checkpoint proposal should be stored
      const retrievedCheckpointProposal = await ap.getCheckpointProposal(proposalId);
      expect(retrievedCheckpointProposal).toBeDefined();

      // No block proposal was extracted (it had none anyway)
      const retrievedBlockProposal = await ap.getBlockProposal(proposalId);
      expect(retrievedBlockProposal).toBeUndefined();
    });

    it('should return undefined for non-existent checkpoint proposal', async () => {
      const nonExistentId = Fr.random().toString();
      const retrievedProposal = await ap.getCheckpointProposal(nonExistentId);
      expect(retrievedProposal).toBeUndefined();
    });

    it('should return alreadyExists when adding proposal with same id', async () => {
      const slotNumber = 420;
      const archive = Fr.random();
      const proposal1 = await mockCheckpointProposalForPool(signers[0], slotNumber, archive);
      const proposalId = proposal1.archive.toString();

      const result1 = await ap.tryAddCheckpointProposal(proposal1);
      expect(result1.added).toBe(true);
      expect(result1.alreadyExists).toBe(false);

      // Create a new proposal with same archive but different signer
      const proposal2 = await mockCheckpointProposalForPool(signers[1], slotNumber, archive);

      const result2 = await ap.tryAddCheckpointProposal(proposal2);
      expect(result2.added).toBe(false);
      expect(result2.alreadyExists).toBe(true);

      // Should still have the first proposal
      const retrievedProposal = await ap.getCheckpointProposal(proposalId);
      expect(retrievedProposal).toBeDefined();
      expect(retrievedProposal!.toBuffer()).toEqual(proposal1.toBuffer());
      expect(retrievedProposal!.getSender()?.toString()).toBe(signers[0].address.toString());
    });

    it('should return added=false when exceeding capacity', async () => {
      const slotNumber = 420;

      // Add MAX_PROPOSALS_PER_SLOT proposals
      for (let i = 0; i < MAX_PROPOSALS_PER_SLOT; i++) {
        const proposal = await mockCheckpointProposalForPool(signers[i % NUMBER_OF_SIGNERS_PER_TEST], slotNumber);
        const result = await ap.tryAddCheckpointProposal(proposal);
        expect(result.added).toBe(true);
        expect(result.totalForPosition).toBe(i + 1);
      }

      // The next proposal should not be added
      const extraProposal = await mockCheckpointProposalForPool(signers[0], slotNumber);
      const result = await ap.tryAddCheckpointProposal(extraProposal);
      expect(result.added).toBe(false);
      expect(result.alreadyExists).toBe(false);
      expect(result.totalForPosition).toBe(MAX_PROPOSALS_PER_SLOT);
    });
  });

  describe('Duplicate proposal detection', () => {
    const mockBlockProposalWithIndex = (
      signer: Secp256k1Signer,
      slotNumber: number,
      indexWithinCheckpoint: number,
      archive: Fr = Fr.random(),
    ): Promise<BlockProposal> => {
      const header = makeBlockHeader(1, { slotNumber: SlotNumber(slotNumber) });
      return makeBlockProposal({
        signer,
        blockHeader: header,
        archiveRoot: archive,
        indexWithinCheckpoint: IndexWithinCheckpoint(indexWithinCheckpoint),
      });
    };

    describe('tryAddBlockProposal duplicate detection', () => {
      it('should return totalForPosition=1 when pool is empty', async () => {
        const proposal = await mockBlockProposalWithIndex(signers[0], 100, 0);
        const result = await ap.tryAddBlockProposal(proposal);

        expect(result.added).toBe(true);
        expect(result.alreadyExists).toBe(false);
        expect(result.totalForPosition).toBe(1);
      });

      it('should return alreadyExists when same proposal exists', async () => {
        const proposal = await mockBlockProposalWithIndex(signers[0], 100, 0);
        await ap.tryAddBlockProposal(proposal);

        const result = await ap.tryAddBlockProposal(proposal);

        expect(result.added).toBe(false);
        expect(result.alreadyExists).toBe(true);
        expect(result.totalForPosition).toBe(1);
      });

      it('should detect duplicate via totalForPosition when different proposal exists at same position', async () => {
        const slotNumber = 100;
        const indexWithinCheckpoint = 2;

        // Add first proposal
        const proposal1 = await mockBlockProposalWithIndex(signers[0], slotNumber, indexWithinCheckpoint);
        const result1 = await ap.tryAddBlockProposal(proposal1);
        expect(result1.totalForPosition).toBe(1);

        // Add a different proposal at same position - this is a duplicate (equivocation)
        const proposal2 = await mockBlockProposalWithIndex(signers[1], slotNumber, indexWithinCheckpoint);
        const result2 = await ap.tryAddBlockProposal(proposal2);

        expect(result2.added).toBe(true);
        expect(result2.alreadyExists).toBe(false);
        // totalForPosition >= 2 indicates duplicate detection
        expect(result2.totalForPosition).toBe(2);
      });

      it('should not detect duplicate for different positions in same slot', async () => {
        const slotNumber = 100;

        // Add proposal at index 0
        const proposal1 = await mockBlockProposalWithIndex(signers[0], slotNumber, 0);
        await ap.tryAddBlockProposal(proposal1);

        // Add proposal at index 1 (different position)
        const proposal2 = await mockBlockProposalWithIndex(signers[1], slotNumber, 1);
        const result = await ap.tryAddBlockProposal(proposal2);

        expect(result.added).toBe(true);
        // totalForPosition = 1 means no duplicate for this position
        expect(result.totalForPosition).toBe(1);
      });

      it('should not detect duplicate for same position in different slots', async () => {
        const indexWithinCheckpoint = 0;

        // Add proposal at slot 100
        const proposal1 = await mockBlockProposalWithIndex(signers[0], 100, indexWithinCheckpoint);
        await ap.tryAddBlockProposal(proposal1);

        // Add proposal at slot 200 (different slot)
        const proposal2 = await mockBlockProposalWithIndex(signers[1], 200, indexWithinCheckpoint);
        const result = await ap.tryAddBlockProposal(proposal2);

        expect(result.added).toBe(true);
        // totalForPosition = 1 means no duplicate for this position
        expect(result.totalForPosition).toBe(1);
      });

      it('should track multiple duplicates correctly via totalForPosition', async () => {
        const slotNumber = 100;
        const indexWithinCheckpoint = 0;

        // Add multiple proposals for same position
        const proposal1 = await mockBlockProposalWithIndex(signers[0], slotNumber, indexWithinCheckpoint);
        const result1 = await ap.tryAddBlockProposal(proposal1);
        expect(result1.totalForPosition).toBe(1);

        const proposal2 = await mockBlockProposalWithIndex(signers[1], slotNumber, indexWithinCheckpoint);
        const result2 = await ap.tryAddBlockProposal(proposal2);
        expect(result2.totalForPosition).toBe(2);

        // Add a third proposal for same position
        const proposal3 = await mockBlockProposalWithIndex(signers[2], slotNumber, indexWithinCheckpoint);
        const result3 = await ap.tryAddBlockProposal(proposal3);

        expect(result3.added).toBe(true);
        expect(result3.totalForPosition).toBe(3);
      });

      it('should return added=false when exceeding capacity', async () => {
        const slotNumber = 100;
        const indexWithinCheckpoint = 0;

        // Add MAX_PROPOSALS_PER_POSITION proposals
        for (let i = 0; i < MAX_PROPOSALS_PER_POSITION; i++) {
          const proposal = await mockBlockProposalWithIndex(
            signers[i % NUMBER_OF_SIGNERS_PER_TEST],
            slotNumber,
            indexWithinCheckpoint,
          );
          const result = await ap.tryAddBlockProposal(proposal);
          expect(result.added).toBe(true);
          expect(result.totalForPosition).toBe(i + 1);
        }

        // The next proposal should not be added
        const extraProposal = await mockBlockProposalWithIndex(signers[0], slotNumber, indexWithinCheckpoint);
        const result = await ap.tryAddBlockProposal(extraProposal);
        expect(result.added).toBe(false);
        expect(result.alreadyExists).toBe(false);
        expect(result.totalForPosition).toBe(MAX_PROPOSALS_PER_POSITION);
      });

      it('should clean up block position index when deleting old data', async () => {
        const slotNumber = 100;
        const indexWithinCheckpoint = 0;

        // Add proposal
        const proposal1 = await mockBlockProposalWithIndex(signers[0], slotNumber, indexWithinCheckpoint);
        await ap.tryAddBlockProposal(proposal1);

        // Verify it's tracked (adding another should show totalForPosition = 2)
        const proposal2 = await mockBlockProposalWithIndex(signers[1], slotNumber, indexWithinCheckpoint);
        let result = await ap.tryAddBlockProposal(proposal2);
        expect(result.totalForPosition).toBe(2);

        // Delete old data
        await ap.deleteOlderThan(SlotNumber(slotNumber + 1));

        // Verify position index is cleaned up (totalForPosition should be 1 now)
        const proposal3 = await mockBlockProposalWithIndex(signers[2], slotNumber, indexWithinCheckpoint);
        result = await ap.tryAddBlockProposal(proposal3);
        expect(result.totalForPosition).toBe(1);
      });

      it('should correctly delete block proposals at slot boundary', async () => {
        // Add proposals at slots 99, 100, and 101 with various indices
        const proposalSlot99Idx0 = await mockBlockProposalWithIndex(signers[0], 99, 0);
        const proposalSlot99Idx1 = await mockBlockProposalWithIndex(signers[1], 99, 1);
        const proposalSlot100Idx0 = await mockBlockProposalWithIndex(signers[2], 100, 0);
        const proposalSlot101Idx0 = await mockBlockProposalWithIndex(signers[3], 101, 0);

        await ap.tryAddBlockProposal(proposalSlot99Idx0);
        await ap.tryAddBlockProposal(proposalSlot99Idx1);
        await ap.tryAddBlockProposal(proposalSlot100Idx0);
        await ap.tryAddBlockProposal(proposalSlot101Idx0);

        // Delete slots older than 100 (should delete slot 99 only)
        await ap.deleteOlderThan(SlotNumber(100));

        // Slot 99 proposals should have their index cleaned up
        const newProposal99 = await mockBlockProposalWithIndex(signers[0], 99, 0);
        const result99 = await ap.tryAddBlockProposal(newProposal99);
        expect(result99.totalForPosition).toBe(1); // Index was cleaned up

        // Slot 100 and 101 should still be tracked
        const newProposal100 = await mockBlockProposalWithIndex(signers[1], 100, 0);
        const result100 = await ap.tryAddBlockProposal(newProposal100);
        expect(result100.totalForPosition).toBe(2); // Still has the original

        const newProposal101 = await mockBlockProposalWithIndex(signers[2], 101, 0);
        const result101 = await ap.tryAddBlockProposal(newProposal101);
        expect(result101.totalForPosition).toBe(2); // Still has the original
      });

      it('should delete all indices for a given slot', async () => {
        const slotNumber = 50;

        // Add proposals at multiple indices for the same slot
        const proposal0 = await mockBlockProposalWithIndex(signers[0], slotNumber, 0);
        const proposal1 = await mockBlockProposalWithIndex(signers[1], slotNumber, 1);
        const proposal2 = await mockBlockProposalWithIndex(signers[2], slotNumber, 2);

        await ap.tryAddBlockProposal(proposal0);
        await ap.tryAddBlockProposal(proposal1);
        await ap.tryAddBlockProposal(proposal2);

        // Delete slots older than slotNumber + 1
        await ap.deleteOlderThan(SlotNumber(slotNumber + 1));

        // All indices should be cleaned up
        const newProposal0 = await mockBlockProposalWithIndex(signers[0], slotNumber, 0);
        const result0 = await ap.tryAddBlockProposal(newProposal0);
        expect(result0.totalForPosition).toBe(1);

        const newProposal1 = await mockBlockProposalWithIndex(signers[1], slotNumber, 1);
        const result1 = await ap.tryAddBlockProposal(newProposal1);
        expect(result1.totalForPosition).toBe(1);

        const newProposal2 = await mockBlockProposalWithIndex(signers[2], slotNumber, 2);
        const result2 = await ap.tryAddBlockProposal(newProposal2);
        expect(result2.totalForPosition).toBe(1);
      });
    });

    describe('tryAddCheckpointProposal duplicate detection', () => {
      const mockCheckpointProposalCoreForPool = async (
        signer: Secp256k1Signer,
        slotNumber: number,
        archive: Fr = Fr.random(),
      ): Promise<CheckpointProposalCore> => {
        const checkpointHeader = makeCheckpointHeader(1, { slotNumber: SlotNumber(slotNumber) });
        const blockHeader = makeBlockHeader(1);
        const proposal = await makeCheckpointProposal({
          signer,
          checkpointHeader,
          archiveRoot: archive,
          lastBlock: { blockHeader },
        });
        return proposal.toCore();
      };

      it('should return totalForPosition=1 when pool is empty', async () => {
        const proposal = await mockCheckpointProposalCoreForPool(signers[0], 100);
        const result = await ap.tryAddCheckpointProposal(proposal);

        expect(result.added).toBe(true);
        expect(result.alreadyExists).toBe(false);
        expect(result.totalForPosition).toBe(1);
      });

      it('should return alreadyExists when same proposal exists', async () => {
        const proposal = await mockCheckpointProposalCoreForPool(signers[0], 100);
        await ap.tryAddCheckpointProposal(proposal);

        const result = await ap.tryAddCheckpointProposal(proposal);

        expect(result.added).toBe(false);
        expect(result.alreadyExists).toBe(true);
        expect(result.totalForPosition).toBe(1);
      });

      it('should detect duplicate via totalForPosition when different proposal exists for same slot', async () => {
        const slotNumber = 100;

        // Add first proposal
        const proposal1 = await mockCheckpointProposalCoreForPool(signers[0], slotNumber);
        const result1 = await ap.tryAddCheckpointProposal(proposal1);
        expect(result1.totalForPosition).toBe(1);

        // Add a different proposal for same slot - this is a duplicate (equivocation)
        const proposal2 = await mockCheckpointProposalCoreForPool(signers[1], slotNumber);
        const result2 = await ap.tryAddCheckpointProposal(proposal2);

        expect(result2.added).toBe(true);
        expect(result2.alreadyExists).toBe(false);
        // totalForPosition >= 2 indicates duplicate detection
        expect(result2.totalForPosition).toBe(2);
      });

      it('should not detect duplicate for different slots', async () => {
        // Add proposal at slot 100
        const proposal1 = await mockCheckpointProposalCoreForPool(signers[0], 100);
        await ap.tryAddCheckpointProposal(proposal1);

        // Add proposal at slot 200 (different slot)
        const proposal2 = await mockCheckpointProposalCoreForPool(signers[1], 200);
        const result = await ap.tryAddCheckpointProposal(proposal2);

        expect(result.added).toBe(true);
        // totalForPosition = 1 means no duplicate for this slot
        expect(result.totalForPosition).toBe(1);
      });

      it('should track multiple duplicates correctly via totalForPosition', async () => {
        const slotNumber = 100;

        // Add multiple proposals for same slot
        const proposal1 = await mockCheckpointProposalCoreForPool(signers[0], slotNumber);
        const result1 = await ap.tryAddCheckpointProposal(proposal1);
        expect(result1.totalForPosition).toBe(1);

        const proposal2 = await mockCheckpointProposalCoreForPool(signers[1], slotNumber);
        const result2 = await ap.tryAddCheckpointProposal(proposal2);
        expect(result2.totalForPosition).toBe(2);

        // Add a third proposal for same slot
        const proposal3 = await mockCheckpointProposalCoreForPool(signers[2], slotNumber);
        const result3 = await ap.tryAddCheckpointProposal(proposal3);

        expect(result3.added).toBe(true);
        expect(result3.totalForPosition).toBe(3);
      });

      it('should not count attestations as proposals for duplicate detection', async () => {
        const slotNumber = 100;
        const archive = Fr.random();

        // Attestation arrives BEFORE the checkpoint proposal (race condition in p2p)
        const attestation = mockCheckpointAttestation(signers[0], slotNumber, archive);
        await ap.addCheckpointAttestations([attestation]);

        // Now the checkpoint proposal arrives - this should NOT be detected as a duplicate
        const proposal = await mockCheckpointProposalCoreForPool(signers[1], slotNumber, archive);
        const result = await ap.tryAddCheckpointProposal(proposal);

        expect(result.added).toBe(true);
        expect(result.alreadyExists).toBe(false);
        // totalForPosition should be 1, NOT 2 - attestations should not count as proposals
        expect(result.totalForPosition).toBe(1);
      });

      it('should not count attestations for different proposals as duplicates', async () => {
        const slotNumber = 100;
        const archive1 = Fr.random();
        const archive2 = Fr.random();

        // Add attestations for two different proposals in the same slot
        const attestation1 = mockCheckpointAttestation(signers[0], slotNumber, archive1);
        const attestation2 = mockCheckpointAttestation(signers[1], slotNumber, archive2);
        await ap.addCheckpointAttestations([attestation1, attestation2]);

        // Add the first checkpoint proposal - should not be affected by attestations
        const proposal1 = await mockCheckpointProposalCoreForPool(signers[2], slotNumber, archive1);
        const result1 = await ap.tryAddCheckpointProposal(proposal1);

        expect(result1.added).toBe(true);
        expect(result1.totalForPosition).toBe(1);

        // Add the second checkpoint proposal - this IS a duplicate (different archive, same slot)
        const proposal2 = await mockCheckpointProposalCoreForPool(signers[3], slotNumber, archive2);
        const result2 = await ap.tryAddCheckpointProposal(proposal2);

        expect(result2.added).toBe(true);
        expect(result2.totalForPosition).toBe(2);
      });
    });
  });
}
