import { getAddressFromPrivateKey } from '@aztec/ethereum';
import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { makeBlockProposal } from '@aztec/stdlib/testing';
import { Tx } from '@aztec/stdlib/tx';

import { generatePrivateKey } from 'viem/accounts';

import { LocalKeyStore } from '../key_store/local_key_store.js';
import { ValidationService } from './validation_service.js';

describe('ValidationService', () => {
  let service: ValidationService;
  let store: LocalKeyStore;
  let keys: `0x${string}`[];
  let addresses: EthAddress[];

  beforeEach(() => {
    keys = [generatePrivateKey(), generatePrivateKey()];
    addresses = keys.map(key => EthAddress.fromString(getAddressFromPrivateKey(key)));
    store = new LocalKeyStore(keys.map(key => Buffer32.fromString(key)));
    service = new ValidationService(store);
  });

  it('creates a proposal with txs appended', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const {
      blockNumber,
      payload: { header, archive, stateReference },
    } = makeBlockProposal({ txs });
    const proposal = await service.createBlockProposal(
      blockNumber,
      header,
      archive,
      stateReference,
      txs,
      addresses[0],
      {
        publishFullTxs: true,
      },
    );
    expect(proposal.getSender()).toEqual(store.getAddress(0));
    expect(proposal.txs).toBeDefined();
    expect(proposal.txs).toBe(txs);
  });

  it('creates a proposal without txs appended', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const {
      blockNumber,
      payload: { header, archive, stateReference },
    } = makeBlockProposal({ txs });
    const proposal = await service.createBlockProposal(
      blockNumber,
      header,
      archive,
      stateReference,
      txs,
      addresses[0],
      {
        publishFullTxs: false,
      },
    );
    expect(proposal.getSender()).toEqual(addresses[0]);
    expect(proposal.txs).toBeUndefined();
  });

  it('attests to proposal', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const proposal = makeBlockProposal({ txs });
    const attestations = await service.attestToProposal(proposal, addresses);
    expect(attestations.length).toBe(2);
    expect(attestations[0].getSender()).toEqual(addresses[0]);
    expect(attestations[1].getSender()).toEqual(addresses[1]);
  });
});
