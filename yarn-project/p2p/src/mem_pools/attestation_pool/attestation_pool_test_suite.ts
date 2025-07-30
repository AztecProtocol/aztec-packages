import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import type { BlockAttestation, BlockProposal } from '@aztec/stdlib/p2p';
import {
  BlockProposal as BlockProposalClass,
  ConsensusPayload,
  SignatureDomainSeparator,
  getHashedSignaturePayloadEthSignedMessage,
} from '@aztec/stdlib/p2p';
import { makeHeader } from '@aztec/stdlib/testing';
import { BlockHeader, TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { PoolInstrumentation } from '../instrumentation.js';
import type { AttestationPool } from './attestation_pool.js';
import { mockAttestation } from './mocks.js';

const NUMBER_OF_SIGNERS_PER_TEST = 4;

export function describeAttestationPool(getAttestationPool: () => AttestationPool) {
  let ap: AttestationPool;
  let signers: Secp256k1Signer[];

  // Check that metrics are recorded correctly
  let metricsMock: MockProxy<PoolInstrumentation<BlockAttestation>>;

  beforeEach(() => {
    ap = getAttestationPool();
    signers = Array.from({ length: NUMBER_OF_SIGNERS_PER_TEST }, () => Secp256k1Signer.random());

    metricsMock = mock<PoolInstrumentation<BlockAttestation>>();
    // Can i overwrite this like this??
    (ap as any).metrics = metricsMock;
  });

  const createAttestationsForSlot = (slotNumber: number) => {
    return signers.map(signer => mockAttestation(signer, slotNumber));
  };

  const mockBlockProposal = (signer: Secp256k1Signer, slotNumber: number, header?: BlockHeader): BlockProposal => {
    const blockNumber = 1;
    const headerToUse = header ?? makeHeader(1, 2, slotNumber);
    const payload = new ConsensusPayload(headerToUse.toPropose(), headerToUse.state);

    const hash = getHashedSignaturePayloadEthSignedMessage(payload, SignatureDomainSeparator.blockProposal);
    const signature = signer.sign(hash);

    const txHashes = [TxHash.random(), TxHash.random()]; // Mock tx hashes

    return new BlockProposalClass(blockNumber, payload, signature, Fr.ZERO, txHashes);
  };

  // We compare buffers as the objects can have cached values attached to them which are not serialised
  // using array containing as the kv store does not respect insertion order
  const compareAttestations = (a1: BlockAttestation[], a2: BlockAttestation[]) => {
    const a1Buffer = a1.map(attestation => attestation.toBuffer());
    const a2Buffer = a2.map(attestation => attestation.toBuffer());
    expect(a1Buffer.length).toBe(a2Buffer.length);
    expect(a1Buffer).toEqual(expect.arrayContaining(a2Buffer));
  };

  it('should add attestations to pool', async () => {
    const slotNumber = 420;
    const header = makeHeader(1, 2, slotNumber);
    const attestations = signers.slice(0, -1).map(signer => mockAttestation(signer, slotNumber, header));
    const headerHash = header.toPropose().hash().toString();

    await ap.addAttestations(attestations);

    const retrievedAttestations = await ap.getAttestationsForSlotAndProposal(BigInt(slotNumber), headerHash);
    expect(retrievedAttestations.length).toBe(attestations.length);
    compareAttestations(retrievedAttestations, attestations);

    const retrievedAttestationsForSlot = await ap.getAttestationsForSlot(BigInt(slotNumber));
    expect(retrievedAttestationsForSlot.length).toBe(attestations.length);
    compareAttestations(retrievedAttestationsForSlot, attestations);

    // Add another one
    const newAttestation = mockAttestation(signers[NUMBER_OF_SIGNERS_PER_TEST - 1], slotNumber);
    await ap.addAttestations([newAttestation]);
    const retrievedAttestationsAfterAdd = await ap.getAttestationsForSlotAndProposal(BigInt(slotNumber), headerHash);
    expect(retrievedAttestationsAfterAdd.length).toBe(attestations.length + 1);
    compareAttestations(retrievedAttestationsAfterAdd, [...attestations, newAttestation]);
    const retrievedAttestationsForSlotAfterAdd = await ap.getAttestationsForSlot(BigInt(slotNumber));
    expect(retrievedAttestationsForSlotAfterAdd.length).toBe(attestations.length + 1);
    compareAttestations(retrievedAttestationsForSlotAfterAdd, [...attestations, newAttestation]);

    // Delete by slot
    await ap.deleteAttestationsForSlot(BigInt(slotNumber));

    const retrievedAttestationsAfterDelete = await ap.getAttestationsForSlotAndProposal(BigInt(slotNumber), headerHash);
    expect(retrievedAttestationsAfterDelete.length).toBe(0);
  });

  it('should handle duplicate proposals in a slot', async () => {
    const slotNumber = 420;
    const header = makeHeader(1, 2, slotNumber);
    const headerHash = header.toPropose().hash().toString();

    // Use the same signer for all attestations
    const attestations: BlockAttestation[] = [];
    const signer = signers[0];
    for (let i = 0; i < NUMBER_OF_SIGNERS_PER_TEST; i++) {
      attestations.push(mockAttestation(signer, slotNumber, header));
    }

    // Add them to store and check we end up with only one
    await ap.addAttestations(attestations);

    const retrievedAttestations = await ap.getAttestationsForSlotAndProposal(BigInt(slotNumber), headerHash);
    expect(retrievedAttestations.length).toBe(1);
    expect(retrievedAttestations[0].toBuffer()).toEqual(attestations[0].toBuffer());
    expect(retrievedAttestations[0].getSender().toString()).toEqual(signer.address.toString());

    // Try adding them on another operation and check they are still not duplicated
    await ap.addAttestations([attestations[0]]);
    expect(await ap.getAttestationsForSlotAndProposal(BigInt(slotNumber), headerHash)).toHaveLength(1);
  });

  it('should store attestations by differing slot', async () => {
    const slotNumbers = [1, 2, 3, 4];
    const attestations = signers.map((signer, i) => mockAttestation(signer, slotNumbers[i]));

    await ap.addAttestations(attestations);

    for (const attestation of attestations) {
      const slot = attestation.payload.header.slotNumber;
      const headerHash = attestation.payload.header.hash();

      const retrievedAttestations = await ap.getAttestationsForSlotAndProposal(slot.toBigInt(), headerHash.toString());
      expect(retrievedAttestations.length).toBe(1);
      expect(retrievedAttestations[0].toBuffer()).toEqual(attestation.toBuffer());
      expect(retrievedAttestations[0].payload.header.slotNumber).toEqual(slot);
    }
  });

  it('should store attestations by differing slot and header hash', async () => {
    const slotNumbers = [1, 1, 2, 3];
    const headers = slotNumbers.map(slotNumber =>
      makeHeader(Math.round(Math.random() * 10000), slotNumber, slotNumber),
    );
    const attestations = signers.map((signer, i) => mockAttestation(signer, slotNumbers[i], headers[i]));

    await ap.addAttestations(attestations);

    for (const attestation of attestations) {
      const slot = attestation.payload.header.slotNumber;
      const proposalId = attestation.payload.header.hash();

      const retrievedAttestations = await ap.getAttestationsForSlotAndProposal(slot.toBigInt(), proposalId.toString());
      expect(retrievedAttestations.length).toBe(1);
      expect(retrievedAttestations[0].toBuffer()).toEqual(attestation.toBuffer());
      expect(retrievedAttestations[0].payload.header.slotNumber).toEqual(slot);
    }
  });

  it('should delete attestations', async () => {
    const slotNumber = 420;
    const attestations = signers.map(signer => mockAttestation(signer, slotNumber));
    const proposalId = attestations[0].payload.header.hash().toString();

    await ap.addAttestations(attestations);

    const retrievedAttestations = await ap.getAttestationsForSlotAndProposal(BigInt(slotNumber), proposalId);
    expect(retrievedAttestations.length).toBe(NUMBER_OF_SIGNERS_PER_TEST);
    compareAttestations(retrievedAttestations, attestations);

    await ap.deleteAttestations(attestations);

    const gottenAfterDelete = await ap.getAttestationsForSlotAndProposal(BigInt(slotNumber), proposalId);
    expect(gottenAfterDelete.length).toBe(0);
  });

  it('should blanket delete attestations per slot', async () => {
    const slotNumber = 420;
    const header = makeHeader(1, 2, slotNumber);
    const attestations = signers.map(signer => mockAttestation(signer, slotNumber, header));
    const proposalId = attestations[0].payload.header.hash().toString();

    await ap.addAttestations(attestations);

    const retrievedAttestations = await ap.getAttestationsForSlotAndProposal(BigInt(slotNumber), proposalId);
    expect(retrievedAttestations.length).toBe(NUMBER_OF_SIGNERS_PER_TEST);
    compareAttestations(retrievedAttestations, attestations);

    await ap.deleteAttestationsForSlot(BigInt(slotNumber));

    const retrievedAttestationsAfterDelete = await ap.getAttestationsForSlotAndProposal(BigInt(slotNumber), proposalId);
    expect(retrievedAttestationsAfterDelete.length).toBe(0);
  });

  it('should blanket delete attestations per slot and proposal', async () => {
    const slotNumber = 420;
    const header = makeHeader(1, 2, slotNumber);
    const attestations = signers.map(signer => mockAttestation(signer, slotNumber, header));
    const proposalId = attestations[0].payload.header.hash().toString();

    // Add another set of attestations with a different proposalId, yet the same slot
    const header2 = makeHeader(2, 2, slotNumber);
    const attestations2 = signers.map(signer => mockAttestation(signer, slotNumber, header2));
    const proposalId2 = attestations2[0].payload.header.hash().toString();

    await ap.addAttestations(attestations);
    await ap.addAttestations(attestations2);

    const retrievedAttestations = await ap.getAttestationsForSlotAndProposal(BigInt(slotNumber), proposalId);
    expect(retrievedAttestations.length).toBe(NUMBER_OF_SIGNERS_PER_TEST);
    compareAttestations(retrievedAttestations, attestations);

    await ap.deleteAttestationsForSlotAndProposal(BigInt(slotNumber), proposalId);

    const retrievedAttestationsAfterDelete = await ap.getAttestationsForSlotAndProposal(BigInt(slotNumber), proposalId);
    expect(retrievedAttestationsAfterDelete.length).toBe(0);

    const retrievedAttestationsAfterDeleteForOtherProposal = await ap.getAttestationsForSlotAndProposal(
      BigInt(slotNumber),
      proposalId2,
    );
    expect(retrievedAttestationsAfterDeleteForOtherProposal.length).toBe(NUMBER_OF_SIGNERS_PER_TEST);
    compareAttestations(retrievedAttestationsAfterDeleteForOtherProposal, attestations2);
  });

  it('should delete attestations older than a given slot', async () => {
    const slotNumbers = [1, 2, 3, 69, 72, 74, 88, 420];
    const attestations = (
      await Promise.all(slotNumbers.map(slotNumber => createAttestationsForSlot(slotNumber)))
    ).flat();
    const proposalId = attestations[0].payload.header.hash().toString();

    await ap.addAttestations(attestations);

    const attestationsForSlot1 = await ap.getAttestationsForSlotAndProposal(BigInt(1), proposalId);
    expect(attestationsForSlot1.length).toBe(signers.length);

    const deleteAttestationsSpy = jest.spyOn(ap, 'deleteAttestationsForSlot');

    await ap.deleteAttestationsOlderThan(BigInt(73));

    const attestationsForSlot1AfterDelete = await ap.getAttestationsForSlotAndProposal(BigInt(1), proposalId);
    expect(attestationsForSlot1AfterDelete.length).toBe(0);

    expect(deleteAttestationsSpy).toHaveBeenCalledTimes(5);
    expect(deleteAttestationsSpy).toHaveBeenCalledWith(BigInt(1));
    expect(deleteAttestationsSpy).toHaveBeenCalledWith(BigInt(2));
    expect(deleteAttestationsSpy).toHaveBeenCalledWith(BigInt(3));
    expect(deleteAttestationsSpy).toHaveBeenCalledWith(BigInt(69));
    expect(deleteAttestationsSpy).toHaveBeenCalledWith(BigInt(72));
  });

  describe('BlockProposal in attestation pool', () => {
    it('should add and retrieve block proposal', async () => {
      const slotNumber = 420;
      const proposal = mockBlockProposal(signers[0], slotNumber);
      const proposalId = proposal.payload.header.hash().toString();

      await ap.addBlockProposal(proposal);

      const retrievedProposal = await ap.getBlockProposal(proposalId);

      // This are cached values, so we need to call them to ensure they are not undefined
      retrievedProposal!.payload.getSize();
      retrievedProposal!.signature.getSize();

      expect(retrievedProposal).toBeDefined();
      expect(retrievedProposal!).toEqual(proposal);
    });

    it('should return undefined for non-existent block proposal', async () => {
      const nonExistentId = Fr.random().toString();
      const retrievedProposal = await ap.getBlockProposal(nonExistentId);
      expect(retrievedProposal).toBeUndefined();
    });

    it('should update block proposal if added twice with same id', async () => {
      const slotNumber = 420;
      const proposal1 = mockBlockProposal(signers[0], slotNumber);
      const proposalId = proposal1.payload.header.hash().toString();

      await ap.addBlockProposal(proposal1);

      // Create a new proposal with same archive but different signer
      const proposal2 = mockBlockProposal(signers[1], slotNumber);

      await ap.addBlockProposal(proposal2);

      const retrievedProposal = await ap.getBlockProposal(proposalId);
      expect(retrievedProposal).toBeDefined();
      // Should have the second proposal
      expect(retrievedProposal!.toBuffer()).toEqual(proposal2.toBuffer());
      expect(retrievedProposal!.getSender().toString()).toBe(signers[1].address.toString());
    });

    it('should handle block proposals with different slots and same archive', async () => {
      // This can't really happen in practice since header hash changes for different slots
      const sharedHeader = makeHeader(1, 2, 100);
      const proposal1 = mockBlockProposal(signers[0], 100, sharedHeader);
      const proposal2 = mockBlockProposal(signers[1], 100, sharedHeader);
      const proposalId = proposal1.payload.header.hash().toString();

      await ap.addBlockProposal(proposal1);
      await ap.addBlockProposal(proposal2);

      // Should get the latest one added (proposal2 overwrites proposal1)
      const retrievedProposal = await ap.getBlockProposal(proposalId);
      expect(retrievedProposal).toBeDefined();
      expect(retrievedProposal!.toBuffer()).toEqual(proposal2.toBuffer());
      expect(retrievedProposal!.getSender().toString()).toBe(signers[1].address.toString());
    });

    it('should delete block proposal when deleting attestations for slot and proposal', async () => {
      const slotNumber = 420;
      const proposal = mockBlockProposal(signers[0], slotNumber);
      const proposalId = proposal.payload.header.hash().toString();

      // Add proposal and some attestations
      await ap.addBlockProposal(proposal);
      const attestations = signers.map(signer => mockAttestation(signer, slotNumber));
      await ap.addAttestations(attestations);

      // Verify proposal exists
      let retrievedProposal = await ap.getBlockProposal(proposalId);
      expect(retrievedProposal).toBeDefined();

      // Delete attestations for slot and proposal
      await ap.deleteAttestationsForSlotAndProposal(BigInt(slotNumber), proposalId);

      // Proposal should be deleted
      retrievedProposal = await ap.getBlockProposal(proposalId);
      expect(retrievedProposal).toBeUndefined();
    });

    it('should delete block proposal when deleting attestations for slot', async () => {
      const slotNumber = 420;
      const proposal = mockBlockProposal(signers[0], slotNumber);
      const proposalId = proposal.payload.header.hash().toString();

      // Add proposal
      await ap.addBlockProposal(proposal);

      // Verify proposal exists
      let retrievedProposal = await ap.getBlockProposal(proposalId);
      expect(retrievedProposal).toBeDefined();

      // Delete attestations for slot
      await ap.deleteAttestationsForSlot(BigInt(slotNumber));

      // Proposal should be deleted
      retrievedProposal = await ap.getBlockProposal(proposalId);
      expect(retrievedProposal).toBeUndefined();
    });

    it('should be able to fetch both block proposal and attestations', async () => {
      const slotNumber = 420;
      const proposal = mockBlockProposal(signers[0], slotNumber);
      const proposalId = proposal.payload.header.hash().toString();

      // Add proposal first
      await ap.addBlockProposal(proposal);

      // Add attestations for the same proposal
      const attestations = signers.slice(1).map(signer => mockAttestation(signer, slotNumber));
      await ap.addAttestations(attestations);

      // Retrieve both proposal and attestations
      const retrievedProposal = await ap.getBlockProposal(proposalId);
      const retrievedAttestations = await ap.getAttestationsForSlotAndProposal(BigInt(slotNumber), proposalId);

      expect(retrievedProposal).toBeDefined();
      // This are cached values, so we need to call them to ensure they are not undefined
      retrievedProposal!.payload.getSize();
      retrievedProposal!.signature.getSize();

      expect(retrievedProposal).toEqual(proposal);

      compareAttestations(retrievedAttestations, attestations);
    });
  });
}
