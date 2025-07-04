import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import type { BlockAttestation } from '@aztec/stdlib/p2p';

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
    const archive = Fr.random();
    return signers.map(signer => mockAttestation(signer, slotNumber, archive));
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
    const archive = Fr.random();
    const attestations = signers.slice(0, -1).map(signer => mockAttestation(signer, slotNumber, archive));

    await ap.addAttestations(attestations);

    const retrievedAttestations = await ap.getAttestationsForSlotAndProposal(BigInt(slotNumber), archive.toString());
    expect(retrievedAttestations.length).toBe(attestations.length);
    compareAttestations(retrievedAttestations, attestations);

    const retrievedAttestationsForSlot = await ap.getAttestationsForSlot(BigInt(slotNumber));
    expect(retrievedAttestationsForSlot.length).toBe(attestations.length);
    compareAttestations(retrievedAttestationsForSlot, attestations);

    // Add another one
    const newAttestation = mockAttestation(signers[NUMBER_OF_SIGNERS_PER_TEST - 1], slotNumber, archive);
    await ap.addAttestations([newAttestation]);
    const retrievedAttestationsAfterAdd = await ap.getAttestationsForSlotAndProposal(
      BigInt(slotNumber),
      archive.toString(),
    );
    expect(retrievedAttestationsAfterAdd.length).toBe(attestations.length + 1);
    compareAttestations(retrievedAttestationsAfterAdd, [...attestations, newAttestation]);
    const retrievedAttestationsForSlotAfterAdd = await ap.getAttestationsForSlot(BigInt(slotNumber));
    expect(retrievedAttestationsForSlotAfterAdd.length).toBe(attestations.length + 1);
    compareAttestations(retrievedAttestationsForSlotAfterAdd, [...attestations, newAttestation]);

    // Delete by slot
    await ap.deleteAttestationsForSlot(BigInt(slotNumber));

    const retreivedAttestationsAfterDelete = await ap.getAttestationsForSlotAndProposal(
      BigInt(slotNumber),
      archive.toString(),
    );
    expect(retreivedAttestationsAfterDelete.length).toBe(0);
  });

  it('should handle duplicate proposals in a slot', async () => {
    const slotNumber = 420;
    const archive = Fr.random();

    // Use the same signer for all attestations
    const attestations: BlockAttestation[] = [];
    const signer = signers[0];
    for (let i = 0; i < NUMBER_OF_SIGNERS_PER_TEST; i++) {
      attestations.push(mockAttestation(signer, slotNumber, archive));
    }

    // Add them to store and check we end up with only one
    await ap.addAttestations(attestations);

    const retreivedAttestations = await ap.getAttestationsForSlotAndProposal(BigInt(slotNumber), archive.toString());
    expect(retreivedAttestations.length).toBe(1);
    expect(retreivedAttestations[0].toBuffer()).toEqual(attestations[0].toBuffer());
    expect(retreivedAttestations[0].getSender().toString()).toEqual(signer.address.toString());

    // Try adding them on another operation and check they are still not duplicated
    await ap.addAttestations([attestations[0]]);
    expect(await ap.getAttestationsForSlotAndProposal(BigInt(slotNumber), archive.toString())).toHaveLength(1);
  });

  it('should store attestations by differing slot', async () => {
    const slotNumbers = [1, 2, 3, 4];
    const attestations = signers.map((signer, i) => mockAttestation(signer, slotNumbers[i]));

    await ap.addAttestations(attestations);

    for (const attestation of attestations) {
      const slot = attestation.payload.header.slotNumber;
      const archive = attestation.archive.toString();

      const retreivedAttestations = await ap.getAttestationsForSlotAndProposal(slot.toBigInt(), archive);
      expect(retreivedAttestations.length).toBe(1);
      expect(retreivedAttestations[0].toBuffer()).toEqual(attestation.toBuffer());
      expect(retreivedAttestations[0].payload.header.slotNumber).toEqual(slot);
    }
  });

  it('should store attestations by differing slot and archive', async () => {
    const slotNumbers = [1, 1, 2, 3];
    const archives = [Fr.random(), Fr.random(), Fr.random(), Fr.random()];
    const attestations = signers.map((signer, i) => mockAttestation(signer, slotNumbers[i], archives[i]));

    await ap.addAttestations(attestations);

    for (const attestation of attestations) {
      const slot = attestation.payload.header.slotNumber;
      const proposalId = attestation.archive.toString();

      const retreivedAttestations = await ap.getAttestationsForSlotAndProposal(slot.toBigInt(), proposalId);
      expect(retreivedAttestations.length).toBe(1);
      expect(retreivedAttestations[0].toBuffer()).toEqual(attestation.toBuffer());
      expect(retreivedAttestations[0].payload.header.slotNumber).toEqual(slot);
    }
  });

  it('should delete attestations', async () => {
    const slotNumber = 420;
    const archive = Fr.random();
    const attestations = signers.map(signer => mockAttestation(signer, slotNumber, archive));
    const proposalId = attestations[0].archive.toString();

    await ap.addAttestations(attestations);

    const retreivedAttestations = await ap.getAttestationsForSlotAndProposal(BigInt(slotNumber), proposalId);
    expect(retreivedAttestations.length).toBe(NUMBER_OF_SIGNERS_PER_TEST);
    compareAttestations(retreivedAttestations, attestations);

    await ap.deleteAttestations(attestations);

    const gottenAfterDelete = await ap.getAttestationsForSlotAndProposal(BigInt(slotNumber), proposalId);
    expect(gottenAfterDelete.length).toBe(0);
  });

  it('should blanket delete attestations per slot', async () => {
    const slotNumber = 420;
    const archive = Fr.random();
    const attestations = signers.map(signer => mockAttestation(signer, slotNumber, archive));
    const proposalId = attestations[0].archive.toString();

    await ap.addAttestations(attestations);

    const retreivedAttestations = await ap.getAttestationsForSlotAndProposal(BigInt(slotNumber), proposalId);
    expect(retreivedAttestations.length).toBe(NUMBER_OF_SIGNERS_PER_TEST);
    compareAttestations(retreivedAttestations, attestations);

    await ap.deleteAttestationsForSlot(BigInt(slotNumber));

    const retreivedAttestationsAfterDelete = await ap.getAttestationsForSlotAndProposal(BigInt(slotNumber), proposalId);
    expect(retreivedAttestationsAfterDelete.length).toBe(0);
  });

  it('should blanket delete attestations per slot and proposal', async () => {
    const slotNumber = 420;
    const archive = Fr.random();
    const attestations = signers.map(signer => mockAttestation(signer, slotNumber, archive));
    const proposalId = attestations[0].archive.toString();

    // Add another set of attestations with a different proposalId, yet the same slot
    const archive2 = Fr.random();
    const attestations2 = signers.map(signer => mockAttestation(signer, slotNumber, archive2));
    const proposalId2 = attestations2[0].archive.toString();

    await ap.addAttestations(attestations);
    await ap.addAttestations(attestations2);

    const retreivedAttestations = await ap.getAttestationsForSlotAndProposal(BigInt(slotNumber), proposalId);
    expect(retreivedAttestations.length).toBe(NUMBER_OF_SIGNERS_PER_TEST);
    compareAttestations(retreivedAttestations, attestations);

    await ap.deleteAttestationsForSlotAndProposal(BigInt(slotNumber), proposalId);

    const retreivedAttestationsAfterDelete = await ap.getAttestationsForSlotAndProposal(BigInt(slotNumber), proposalId);
    expect(retreivedAttestationsAfterDelete.length).toBe(0);

    const retreivedAttestationsAfterDeleteForOtherProposal = await ap.getAttestationsForSlotAndProposal(
      BigInt(slotNumber),
      proposalId2,
    );
    expect(retreivedAttestationsAfterDeleteForOtherProposal.length).toBe(NUMBER_OF_SIGNERS_PER_TEST);
    compareAttestations(retreivedAttestationsAfterDeleteForOtherProposal, attestations2);
  });

  it('should delete attestations older than a given slot', async () => {
    const slotNumbers = [1, 2, 3, 69, 72, 74, 88, 420];
    const attestations = (
      await Promise.all(slotNumbers.map(slotNumber => createAttestationsForSlot(slotNumber)))
    ).flat();
    const proposalId = attestations[0].archive.toString();

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
}
