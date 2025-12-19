import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import { CompleteAddress } from '@aztec/stdlib/contract';
import { siloNullifier } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { BlockHeader, GlobalVariables, type IndexedTxEffect, TxEffect } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import {
  AddressDataProvider,
  AnchorBlockDataProvider,
  ContractDataProvider,
  PrivateEventDataProvider,
} from '../../storage/index.js';
import { deliverEvent } from './common.js';

jest.setTimeout(30_000);

describe('Common oracle functions', () => {
  let aztecNode: MockProxy<AztecNode>;

  let addressDataProvider: AddressDataProvider;
  let contractDataProvider: ContractDataProvider;
  let anchorBlockDataProvider: AnchorBlockDataProvider;
  let keyStore: KeyStore;
  let privateEventDataProvider: PrivateEventDataProvider;

  let recipient: CompleteAddress;
  let contractAddress: AztecAddress;

  // The block number of the last log to be emitted.
  const MAX_BLOCK_NUMBER_OF_A_LOG = BlockNumber(3);

  beforeEach(async () => {
    const store = await openTmpStore('test');
    aztecNode = mock<AztecNode>();
    contractDataProvider = new ContractDataProvider(store);
    jest.spyOn(contractDataProvider, 'getDebugContractName').mockImplementation(() => Promise.resolve('TestContract'));

    addressDataProvider = new AddressDataProvider(store);
    anchorBlockDataProvider = new AnchorBlockDataProvider(store);
    keyStore = new KeyStore(store);
    privateEventDataProvider = new PrivateEventDataProvider(store);

    // Set up recipient account
    recipient = await keyStore.addAccount(new Fr(69), Fr.random());
    await addressDataProvider.addCompleteAddress(recipient);

    // PXEOracleInterface.syncTaggedLogs(...) function syncs logs up to the block number up to which PXE synced. We set
    // the synced block number to that of the last emitted log to receive all the logs by default.
    await setSyncedBlockNumber(MAX_BLOCK_NUMBER_OF_A_LOG);

    contractAddress = await AztecAddress.random();
  });

  describe('deliverEvent', () => {
    let blockNumber: BlockNumber;
    let eventSelector: EventSelector;
    let eventContent: Fr[];
    let eventCommitment: Fr;
    let eventNullifier: Fr;
    let txEffect: TxEffect;
    let indexedTxEffect: IndexedTxEffect;

    // beforeEach sets up the happy path case, so error modes are tested
    // by minimally failing happy path conditions
    beforeEach(async () => {
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
    });

    function runDeliverEvent(
      overrides: {
        eventCommitment?: Fr;
      } = {},
    ) {
      return deliverEvent(
        contractAddress,
        eventSelector,
        eventContent,
        overrides.eventCommitment || eventCommitment,
        txEffect.txHash,
        recipient.address,
        anchorBlockDataProvider,
        aztecNode,
        privateEventDataProvider,
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
      const result = await privateEventDataProvider.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: blockNumber,
        toBlock: blockNumber + 1,
        scopes: [recipient.address],
      });

      expect(result.length).toEqual(1);
      expect(result[0].packedEvent).toEqual(eventContent);
    });
  });

  const setSyncedBlockNumber = (blockNumber: BlockNumber) => {
    return anchorBlockDataProvider.setHeader(
      BlockHeader.empty({
        globalVariables: GlobalVariables.empty({ blockNumber }),
      }),
    );
  };
});
