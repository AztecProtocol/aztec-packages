import { Buffer32 } from '@aztec/foundation/buffer';
import { makeBlockProposal } from '@aztec/stdlib/testing';

import { generatePrivateKey } from 'viem/accounts';

import { LocalKeyStore } from '../key_store/local_key_store.js';
import { ValidationService } from './validation_service.js';

describe('ValidationService', () => {
  let service: ValidationService;
  let store: LocalKeyStore;
  let key: `0x${string}`;

  beforeEach(() => {
    key = generatePrivateKey();
    store = new LocalKeyStore(Buffer32.fromString(key));
    service = new ValidationService(store);
  });

  it('creates a proposal', async () => {
    const {
      payload: { header, archive, txHashes },
    } = await makeBlockProposal();
    const proposal = await service.createBlockProposal(header, archive, txHashes);
    await expect(proposal.getSender()).resolves.toEqual(store.getAddress());
  });

  it('attests to proposal', async () => {
    const proposal = await makeBlockProposal();
    const attestation = await service.attestToProposal(proposal);
    await expect(attestation.getSender()).resolves.toEqual(store.getAddress());
  });
});
