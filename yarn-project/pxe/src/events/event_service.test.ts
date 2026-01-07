import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import { siloNullifier } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { BlockHeader, GlobalVariables, type IndexedTxEffect, TxEffect } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';

import { AnchorBlockStore } from '../storage/anchor_block_store/anchor_block_store.js';
import { PrivateEventStore } from '../storage/private_event_store/private_event_store.js';
import { EventService } from './event_service.js';

describe('deliverEvent', () => {
  let blockNumber: BlockNumber;
  let eventSelector: EventSelector;
  let eventContent: Fr[];
  let eventCommitment: Fr;
  let eventNullifier: Fr;
  let txEffect: TxEffect;
  let indexedTxEffect: IndexedTxEffect;
  let contractAddress: AztecAddress;
  let recipient: AztecAddress;

  let anchorBlockStore: AnchorBlockStore;
  let privateEventStore: PrivateEventStore;
  let aztecNode: ReturnType<typeof mock<AztecNode>>;

  let eventService: EventService;
  const TEST_JOB_ID = 'test-job-id';

  const setSyncedBlockNumber = (blockNumber: BlockNumber) => {
    return anchorBlockStore.setHeader(
      BlockHeader.empty({
        globalVariables: GlobalVariables.empty({ blockNumber }),
      }),
    );
  };

  // beforeEach sets up the happy path case, so error modes are tested
  // by minimally failing happy path conditions
  beforeEach(async () => {
    const store = await openTmpStore('test');
    anchorBlockStore = new AnchorBlockStore(store);
    privateEventStore = new PrivateEventStore(store);

    aztecNode = mock<AztecNode>();

    contractAddress = await AztecAddress.random();
    recipient = await AztecAddress.random();

    blockNumber = BlockNumber(42);
    eventSelector = EventSelector.random();
    eventContent = [Fr.random(), Fr.random()];

    eventCommitment = Fr.random();
    eventNullifier = await siloNullifier(contractAddress, eventCommitment);

    txEffect = TxEffect.from({
      ...(await TxEffect.random()),
      nullifiers: [eventNullifier],
    });

    indexedTxEffect = {
      l2BlockNumber: blockNumber,
      l2BlockHash: L2BlockHash.random(),
      data: txEffect,
      txIndexInBlock: 0,
    };

    /* Happy path context conditions:
     ** - PXE is sync'd to _at least_ block including tx
     ** - Node knows tx effect
     ** - Node knows siloed event commitment
     */
    await setSyncedBlockNumber(blockNumber);

    aztecNode.getTxEffect.mockImplementation(() => Promise.resolve(indexedTxEffect));

    aztecNode.findLeavesIndexes.mockImplementation(() =>
      Promise.resolve([
        {
          data: BigInt(0),
          l2BlockNumber: indexedTxEffect.l2BlockNumber,
          l2BlockHash: indexedTxEffect.l2BlockHash,
        },
      ]),
    );

    eventService = new EventService(anchorBlockStore, aztecNode, privateEventStore, TEST_JOB_ID);
  });

  function runDeliverEvent(
    overrides: {
      eventCommitment?: Fr;
    } = {},
  ) {
    return eventService.deliverEvent(
      contractAddress,
      eventSelector,
      eventContent,
      overrides.eventCommitment || eventCommitment,
      txEffect.txHash,
      recipient,
    );
  }

  it('should throw when tx does not exist or has no effects', async () => {
    aztecNode.getTxEffect.mockImplementation(() => Promise.resolve(undefined));
    await expect(runDeliverEvent).rejects.toThrow(/Could not find tx effect for tx hash/);
  });

  it('should throw when tx block has not yet been synchronized', async () => {
    indexedTxEffect = {
      ...indexedTxEffect,
      l2BlockNumber: BlockNumber(blockNumber + 1),
    };
    aztecNode.getTxEffect.mockImplementation(() => Promise.resolve(indexedTxEffect));

    await expect(runDeliverEvent).rejects.toThrow(/Could not find tx effect for tx hash .* as of block number/);
  });

  it('should throw if event is not in tx effects', async () => {
    await expect(runDeliverEvent({ eventCommitment: Fr.random() })).rejects.toThrow(
      /Event commitment .* is not present in tx/,
    );
  });

  it('should throw if event is not in nullifiers', async () => {
    aztecNode.findLeavesIndexes.mockImplementation(() => Promise.resolve([]));

    await expect(runDeliverEvent).rejects.toThrow(/Event commitment .* is not present on the nullifier tree/);
  });

  it('should store event for later retrieval', async () => {
    await runDeliverEvent();

    // I should be able to retrieve the private event I just saved using getPrivateEvents
    const result = await privateEventStore.getPrivateEvents(
      eventSelector,
      {
        contractAddress,
        fromBlock: blockNumber,
        toBlock: blockNumber + 1,
        scopes: [recipient],
      },
      TEST_JOB_ID,
    );

    expect(result.length).toEqual(1);
    expect(result[0].packedEvent).toEqual(eventContent);
  });
});
