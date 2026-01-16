import { getAddressFromPrivateKey } from '@aztec/ethereum/account';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { makeCheckpointProposal, makeL2BlockHeader } from '@aztec/stdlib/testing';
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

  it('creates a block proposal with txs appended', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const l2BlockHeader = makeL2BlockHeader(1, 2, 3);
    const blockHeader = l2BlockHeader.toBlockHeader();
    const indexWithinCheckpoint = 0;
    const inHash = Fr.random();
    const archive = Fr.random();

    const proposal = await service.createBlockProposal(
      blockHeader,
      indexWithinCheckpoint,
      inHash,
      archive,
      txs,
      addresses[0],
      { publishFullTxs: true },
    );
    expect(proposal.getSender()).toEqual(store.getAddress(0));
    expect(proposal.txs).toBeDefined();
    expect(proposal.txs).toBe(txs);
  });

  it('creates a block proposal without txs appended', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const l2BlockHeader = makeL2BlockHeader(1, 2, 3);
    const blockHeader = l2BlockHeader.toBlockHeader();
    const indexWithinCheckpoint = 0;
    const inHash = Fr.random();
    const archive = Fr.random();

    const proposal = await service.createBlockProposal(
      blockHeader,
      indexWithinCheckpoint,
      inHash,
      archive,
      txs,
      addresses[0],
      { publishFullTxs: false },
    );
    expect(proposal.getSender()).toEqual(addresses[0]);
    expect(proposal.txs).toBeUndefined();
  });

  it('attests to checkpoint proposal', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const proposal = await makeCheckpointProposal({ lastBlock: { txs } });
    const attestations = await service.attestToCheckpointProposal(proposal, addresses);
    expect(attestations.length).toBe(2);
    expect(attestations[0].getSender()).toEqual(addresses[0]);
    expect(attestations[1].getSender()).toEqual(addresses[1]);
  });
});
