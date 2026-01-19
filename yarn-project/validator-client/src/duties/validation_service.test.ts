import { getAddressFromPrivateKey } from '@aztec/ethereum/account';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { makeBlockHeader, makeCheckpointHeader, makeCheckpointProposal } from '@aztec/stdlib/testing';
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
    service = new ValidationService(store);
  });

  it('creates a block proposal with txs appended', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const blockHeader = makeBlockHeader(1);
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
    const blockHeader = makeBlockHeader(1);
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

  it('creates checkpoint proposal with different duty types for checkpoint and block', async () => {
    // This test verifies the fix for HA double-signing issue where both checkpoint
    // and block were incorrectly using the same CHECKPOINT_PROPOSAL duty type.
    // Now they should use CHECKPOINT_PROPOSAL and BLOCK_PROPOSAL respectively.

    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const blockHeader = makeBlockHeader(1);
    const indexWithinCheckpoint = 0;
    const archive = Fr.random();

    // Create a spy keystore to capture signing contexts
    const capturedContexts: Array<{ dutyType: DutyType; blockIndexWithinCheckpoint?: number }> = [];
    const spyStore = {
      ...store,
      signMessageWithAddress: (address: EthAddress, message: Buffer32, context: any) => {
        capturedContexts.push({
          dutyType: context.dutyType,
          blockIndexWithinCheckpoint: context.blockIndexWithinCheckpoint,
        });
        return store.signMessageWithAddress(address, message, context);
      },
      getAddress: (index: number) => store.getAddress(index),
      getAddresses: () => store.getAddresses(),
    };
    const spyService = new ValidationService(spyStore as any);

    // Create checkpoint header
    const checkpointHeader = makeCheckpointHeader(1);

    // Create checkpoint proposal with lastBlock
    const proposal = await spyService.createCheckpointProposal(
      checkpointHeader,
      archive,
      {
        blockHeader,
        indexWithinCheckpoint,
        txs,
      },
      addresses[0],
      { publishFullTxs: true },
    );

    // Verify proposal was created successfully
    expect(proposal.getSender()).toEqual(addresses[0]);
    expect(proposal.lastBlock).toBeDefined();

    // Verify we captured signing operations:
    // 1. CHECKPOINT_PROPOSAL for the checkpoint itself
    // 2. BLOCK_PROPOSAL for the block itself
    // 3. TXS for the SignedTxs
    expect(capturedContexts.length).toBe(3);

    // Find the checkpoint and block signatures
    const checkpointSigs = capturedContexts.filter(c => c.dutyType === DutyType.CHECKPOINT_PROPOSAL);
    const blockSigs = capturedContexts.filter(c => c.dutyType === DutyType.BLOCK_PROPOSAL);
    const txsSigs = capturedContexts.filter(c => c.dutyType === DutyType.TXS);

    // Should have exactly 1 checkpoint signature (no blockIndexWithinCheckpoint)
    expect(checkpointSigs.length).toBe(1);
    expect(checkpointSigs[0].blockIndexWithinCheckpoint).toBeUndefined();

    // Should have exactly 2 block signatures (both with blockIndexWithinCheckpoint)
    // One for the block proposal, one for the SignedTxs
    expect(blockSigs.length).toBe(1);
    expect(blockSigs[0].blockIndexWithinCheckpoint).toBe(indexWithinCheckpoint);

    // Should have exactly 1 txs signature
    expect(txsSigs.length).toBe(1);
    expect(txsSigs[0].blockIndexWithinCheckpoint).toBeUndefined();
  });
});
