import { getAddressFromPrivateKey } from '@aztec/ethereum/account';
import { CheckpointNumber, IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import {
  TEST_COORDINATION_SIGNATURE_CONTEXT,
  makeBlockHeader,
  makeCheckpointHeader,
  makeCheckpointProposal,
} from '@aztec/stdlib/testing';
import { Tx } from '@aztec/stdlib/tx';
import { DutyType } from '@aztec/validator-ha-signer/types';

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
    service = new ValidationService(store, TEST_COORDINATION_SIGNATURE_CONTEXT);
  });

  it('creates a block proposal with txs appended', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const blockHeader = makeBlockHeader(1);
    const indexWithinCheckpoint = IndexWithinCheckpoint(0);
    const archive = Fr.random();

    const proposal = await service.createBlockProposal(
      blockHeader,
      CheckpointNumber(1),
      indexWithinCheckpoint,
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
    const blockHeader = makeBlockHeader(1);
    const indexWithinCheckpoint = IndexWithinCheckpoint(0);
    const archive = Fr.random();

    const proposal = await service.createBlockProposal(
      blockHeader,
      CheckpointNumber(1),
      indexWithinCheckpoint,
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
    const attestations = await service.attestToCheckpointProposal(proposal, addresses, CheckpointNumber(1));
    expect(attestations.length).toBe(2);
    expect(attestations[0].getSender()).toEqual(addresses[0]);
    expect(attestations[1].getSender()).toEqual(addresses[1]);
  });

  it('creates checkpoint proposal with an already-signed block proposal', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const blockHeader = makeBlockHeader(1);
    const indexWithinCheckpoint = IndexWithinCheckpoint(0);
    const archive = Fr.random();
    const checkpointHeader = makeCheckpointHeader(1);

    // Create the block proposal first (as the sequencer would) so that getSender() can verify the block proposal
    // sender matches.
    const blockProposal = await service.createBlockProposal(
      blockHeader,
      CheckpointNumber(1),
      indexWithinCheckpoint,
      archive,
      txs,
      addresses[0],
      { publishFullTxs: true },
    );

    // Create a spy keystore to capture signing contexts
    const capturedContexts: Array<{ dutyType: DutyType; blockIndexWithinCheckpoint?: number }> = [];
    const spyStore = {
      ...store,
      signTypedDataWithAddress: (address: EthAddress, typedData: any, context: any) => {
        capturedContexts.push({
          dutyType: context.dutyType,
          blockIndexWithinCheckpoint: context.blockIndexWithinCheckpoint,
        });
        return store.signTypedDataWithAddress(address, typedData, context);
      },
      getAddress: (index: number) => store.getAddress(index),
      getAddresses: () => store.getAddresses(),
    };
    const spyService = new ValidationService(spyStore as any, TEST_COORDINATION_SIGNATURE_CONTEXT);

    // Create checkpoint proposal with the already-signed block proposal
    const proposal = await spyService.createCheckpointProposal(
      checkpointHeader,
      archive,
      CheckpointNumber(1),
      0n,
      blockProposal,
      addresses[0],
      {},
    );

    // Verify proposal was created successfully
    expect(proposal.getSender()).toEqual(addresses[0]);
    expect(proposal.lastBlock).toBeDefined();
    expect(proposal.lastBlock!.signature).toEqual(blockProposal.signature);

    // Only the checkpoint signing should happen — the block was already signed
    expect(capturedContexts.length).toBe(1);
    expect(capturedContexts[0].dutyType).toBe(DutyType.CHECKPOINT_PROPOSAL);
  });
});
