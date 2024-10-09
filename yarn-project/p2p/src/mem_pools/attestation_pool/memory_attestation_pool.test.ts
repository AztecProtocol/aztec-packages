import { type BlockAttestation } from '@aztec/circuit-types';
import { Fr } from '@aztec/foundation/fields';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { type MockProxy, mock } from 'jest-mock-extended';
import { type PrivateKeyAccount } from 'viem';

import { type PoolInstrumentation } from '../tx_pool/instrumentation.js';
import { InMemoryAttestationPool } from './memory_attestation_pool.js';
import { generateAccount, mockAttestation } from './mocks.js';

const NUMBER_OF_SIGNERS_PER_TEST = 4;

describe('MemoryAttestationPool', () => {
  let ap: InMemoryAttestationPool;
  let signers: PrivateKeyAccount[];
  const telemetry = new NoopTelemetryClient();

  // Check that metrics are recorded correctly
  let metricsMock: MockProxy<PoolInstrumentation<BlockAttestation>>;

  beforeEach(() => {
    // Use noop telemetry client while testing.

    ap = new InMemoryAttestationPool(telemetry);
    signers = Array.from({ length: NUMBER_OF_SIGNERS_PER_TEST }, generateAccount);

    metricsMock = mock<PoolInstrumentation<BlockAttestation>>();
    // Can i overwrite this like this??
    (ap as any).metrics = metricsMock;
  });

  it('should add attestations to pool', async () => {
    const slotNumber = 420;
    const archive = Fr.random();
    const attestations = await Promise.all(signers.map(signer => mockAttestation(signer, slotNumber, archive)));

    const proposalId = attestations[0].p2pMessageIdentifier().toString();

    await ap.addAttestations(attestations);

    // Check metrics have been updated.
    expect(metricsMock.recordAddedObjects).toHaveBeenCalledWith(attestations.length);

    const retreivedAttestations = await ap.getAttestationsForSlot(BigInt(slotNumber), proposalId);

    expect(retreivedAttestations.length).toBe(NUMBER_OF_SIGNERS_PER_TEST);
    expect(retreivedAttestations).toEqual(attestations);

    // Delete by slot
    await ap.deleteAttestationsForSlot(BigInt(slotNumber));

    expect(metricsMock.recordRemovedObjects).toHaveBeenCalledWith(attestations.length);

    const retreivedAttestationsAfterDelete = await ap.getAttestationsForSlot(BigInt(slotNumber), proposalId);
    expect(retreivedAttestationsAfterDelete.length).toBe(0);
  });

  it('Should store attestations by differing slot', async () => {
    const slotNumbers = [1, 2, 3, 4];
    const attestations = await Promise.all(signers.map((signer, i) => mockAttestation(signer, slotNumbers[i])));

    await ap.addAttestations(attestations);

    for (const attestation of attestations) {
      const slot = attestation.payload.header.globalVariables.slotNumber;
      const proposalId = attestation.p2pMessageIdentifier().toString();

      const retreivedAttestations = await ap.getAttestationsForSlot(slot.toBigInt(), proposalId);
      expect(retreivedAttestations.length).toBe(1);
      expect(retreivedAttestations[0]).toEqual(attestation);
      expect(retreivedAttestations[0].payload.header.globalVariables.slotNumber).toEqual(slot);
    }
  });

  it('Should store attestations by differing slot and archive', async () => {
    const slotNumbers = [1, 2, 3, 4];
    const archives = [Fr.random(), Fr.random(), Fr.random(), Fr.random()];
    const attestations = await Promise.all(
      signers.map((signer, i) => mockAttestation(signer, slotNumbers[i], archives[i])),
    );

    await ap.addAttestations(attestations);

    for (const attestation of attestations) {
      const slot = attestation.payload.header.globalVariables.slotNumber;
      const proposalId = attestation.p2pMessageIdentifier().toString();

      const retreivedAttestations = await ap.getAttestationsForSlot(slot.toBigInt(), proposalId);
      expect(retreivedAttestations.length).toBe(1);
      expect(retreivedAttestations[0]).toEqual(attestation);
      expect(retreivedAttestations[0].payload.header.globalVariables.slotNumber).toEqual(slot);
    }
  });

  it('Should delete attestations', async () => {
    const slotNumber = 420;
    const archive = Fr.random();
    const attestations = await Promise.all(signers.map(signer => mockAttestation(signer, slotNumber, archive)));
    const proposalId = attestations[0].p2pMessageIdentifier().toString();

    await ap.addAttestations(attestations);

    expect(metricsMock.recordAddedObjects).toHaveBeenCalledWith(attestations.length);

    const retreivedAttestations = await ap.getAttestationsForSlot(BigInt(slotNumber), proposalId);
    expect(retreivedAttestations.length).toBe(NUMBER_OF_SIGNERS_PER_TEST);
    expect(retreivedAttestations).toEqual(attestations);

    await ap.deleteAttestations(attestations);

    expect(metricsMock.recordRemovedObjects).toHaveBeenCalledWith(attestations.length);

    const gottenAfterDelete = await ap.getAttestationsForSlot(BigInt(slotNumber), proposalId);
    expect(gottenAfterDelete.length).toBe(0);
  });

  it('Should blanket delete attestations per slot', async () => {
    const slotNumber = 420;
    const archive = Fr.random();
    const attestations = await Promise.all(signers.map(signer => mockAttestation(signer, slotNumber, archive)));
    const proposalId = attestations[0].p2pMessageIdentifier().toString();

    await ap.addAttestations(attestations);

    const retreivedAttestations = await ap.getAttestationsForSlot(BigInt(slotNumber), proposalId);
    expect(retreivedAttestations.length).toBe(NUMBER_OF_SIGNERS_PER_TEST);
    expect(retreivedAttestations).toEqual(attestations);

    await ap.deleteAttestationsForSlot(BigInt(slotNumber));

    const retreivedAttestationsAfterDelete = await ap.getAttestationsForSlot(BigInt(slotNumber), proposalId);
    expect(retreivedAttestationsAfterDelete.length).toBe(0);
  });

  it('Should blanket delete attestations per slot and proposal', async () => {
    const slotNumber = 420;
    const archive = Fr.random();
    const attestations = await Promise.all(signers.map(signer => mockAttestation(signer, slotNumber, archive)));
    const proposalId = attestations[0].p2pMessageIdentifier().toString();

    await ap.addAttestations(attestations);

    expect(metricsMock.recordAddedObjects).toHaveBeenCalledWith(attestations.length);

    const retreivedAttestations = await ap.getAttestationsForSlot(BigInt(slotNumber), proposalId);
    expect(retreivedAttestations.length).toBe(NUMBER_OF_SIGNERS_PER_TEST);
    expect(retreivedAttestations).toEqual(attestations);

    await ap.deleteAttestationsForSlotAndProposal(BigInt(slotNumber), proposalId);

    expect(metricsMock.recordRemovedObjects).toHaveBeenCalledWith(attestations.length);

    const retreivedAttestationsAfterDelete = await ap.getAttestationsForSlot(BigInt(slotNumber), proposalId);
    expect(retreivedAttestationsAfterDelete.length).toBe(0);
  });
});
