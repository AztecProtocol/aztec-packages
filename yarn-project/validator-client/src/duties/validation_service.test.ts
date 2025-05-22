import { Buffer32 } from '@aztec/foundation/buffer';
import { makeBlockProposal } from '@aztec/stdlib/testing';
import { Tx } from '@aztec/stdlib/tx';

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

  it('creates a proposal with txs appended', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const {
      blockNumber,
      payload: { header, archive, stateReference },
    } = makeBlockProposal({ txs });
    const proposal = await service.createBlockProposal(blockNumber, header, archive, stateReference, txs, {
      publishFullTxs: true,
    });
    expect(proposal.getSender()).toEqual(store.getAddress());
    expect(proposal.txs).toBeDefined();
    expect(proposal.txs).toBe(txs);
  });

  it('creates a proposal without txs appended', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const {
      blockNumber,
      payload: { header, archive, stateReference },
    } = makeBlockProposal({ txs });
    const proposal = await service.createBlockProposal(blockNumber, header, archive, stateReference, txs, {
      publishFullTxs: false,
    });
    expect(proposal.getSender()).toEqual(store.getAddress());
    expect(proposal.txs).toBeUndefined();
  });

  it('attests to proposal', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const proposal = makeBlockProposal({ txs });
    const attestation = await service.attestToProposal(proposal);
    expect(attestation.getSender()).toEqual(store.getAddress());
  });
});
