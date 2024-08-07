import { BlockAttestation } from '@aztec/circuit-types';
import { makeHeader } from '@aztec/circuits.js/testing';

import { PrivateKeyAccount } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { InMemoryAttestationPool } from './memory_attestation_pool.js';

const NUMBER_OF_SIGNERS_PER_TEST = 4;

const generateAccount = () => {
  const privateKey = generatePrivateKey();
  return privateKeyToAccount(privateKey);
};

const makeAttestation = async (signer: PrivateKeyAccount, slot: number = 0) => {
  // Use arbitrary numbers for all other than slot
  const header = makeHeader(1, 2, slot);
  const hash = header.hash();
  const message = hash.toString();
  const sigString = await signer.signMessage({ message });
  const signature = Buffer.from(sigString.slice(2), 'hex');

  return new BlockAttestation(header, signature);
};

describe('MemoryAttestationPool', () => {
  let ap: InMemoryAttestationPool;
  let signers: PrivateKeyAccount[];

  beforeEach(() => {
    ap = new InMemoryAttestationPool();
    signers = new Array(NUMBER_OF_SIGNERS_PER_TEST).fill(0).map(() => generateAccount());
  });

  it('should add attestation to pool', async () => {
    const slotNumber = 420;
    const attestations = await Promise.all(signers.map(signer => makeAttestation(signer, slotNumber)));

    await ap.addAttestations(attestations);

    const retreivedAttestations = await ap.getAttestationsForSlot(BigInt(slotNumber));

    expect(retreivedAttestations.length).toBe(NUMBER_OF_SIGNERS_PER_TEST);
    expect(retreivedAttestations).toEqual(attestations);

    // Delete by slot
    await ap.deleteAttestationsForSlot(BigInt(slotNumber));

    const retreivedAttestationsAfterDelete = await ap.getAttestationsForSlot(BigInt(slotNumber));
    expect(retreivedAttestationsAfterDelete.length).toBe(0);
  });

  it('Should store attestations by differing slot', async () => {
    const slotNumbers = [1, 2, 3, 4];
    const attestations = await Promise.all(signers.map((signer, i) => makeAttestation(signer, slotNumbers[i])));

    await ap.addAttestations(attestations);

    for (const attestation of attestations) {
      const slot = attestation.header.globalVariables.slotNumber;

      const retreivedAttestations = await ap.getAttestationsForSlot(slot.toBigInt());
      expect(retreivedAttestations.length).toBe(1);
      expect(retreivedAttestations[0]).toEqual(attestation);
      expect(retreivedAttestations[0].header.globalVariables.slotNumber).toEqual(slot);
    }
  });

  it('Should delete attestations', async () => {
    const slotNumber = 420;
    const attestations = await Promise.all(signers.map(signer => makeAttestation(signer, slotNumber)));

    await ap.addAttestations(attestations);

    const retreivedAttestations = await ap.getAttestationsForSlot(BigInt(slotNumber));
    expect(retreivedAttestations.length).toBe(NUMBER_OF_SIGNERS_PER_TEST);
    expect(retreivedAttestations).toEqual(attestations);

    await ap.deleteAttestations(attestations);

    const gottenAfterDelete = await ap.getAttestationsForSlot(BigInt(slotNumber));
    expect(gottenAfterDelete.length).toBe(0);
  });
});
