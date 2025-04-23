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
      blockNumber,
      payload: { header, archive, stateReference, txHashes },
    } = makeBlockProposal();
    const proposal = await service.createBlockProposal(blockNumber, header, archive, stateReference, txHashes);
    expect(proposal.getSender()).toEqual(store.getAddress());
  });

  it('attests to proposal', async () => {
    const proposal = makeBlockProposal();
    const attestation = await service.attestToProposal(proposal);
    expect(attestation.getSender()).toEqual(store.getAddress());
  });
});
