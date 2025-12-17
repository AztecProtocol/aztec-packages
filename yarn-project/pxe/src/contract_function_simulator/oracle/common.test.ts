import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { CompleteAddress } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { BlockHeader, GlobalVariables } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { AddressDataProvider, AnchorBlockDataProvider, ContractDataProvider } from '../../storage/index.js';
import { getLowNullifierMembershipWitness } from './common.js';

jest.setTimeout(30_000);

describe('Common oracle functions', () => {
  let aztecNode: MockProxy<AztecNode>;

  let addressDataProvider: AddressDataProvider;
  let contractDataProvider: ContractDataProvider;
  let anchorBlockDataProvider: AnchorBlockDataProvider;
  let keyStore: KeyStore;

  let recipient: CompleteAddress;

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

    // Set up recipient account
    recipient = await keyStore.addAccount(new Fr(69), Fr.random());
    await addressDataProvider.addCompleteAddress(recipient);

    // PXEOracleInterface.syncTaggedLogs(...) function syncs logs up to the block number up to which PXE synced. We set
    // the synced block number to that of the last emitted log to receive all the logs by default.
    await setSyncedBlockNumber(MAX_BLOCK_NUMBER_OF_A_LOG);
  });

  describe('Respects synced block number', () => {
    const syncedBlockNumber = 100;
    let nullifier: Fr;

    beforeEach(async () => {
      nullifier = Fr.random();
      await setSyncedBlockNumber(BlockNumber(syncedBlockNumber));
    });

    it('throws when getting low nullifier membership witness for future block', async () => {
      await expect(
        getLowNullifierMembershipWitness(
          BlockNumber(syncedBlockNumber + 1),
          nullifier,
          anchorBlockDataProvider,
          aztecNode,
        ),
      ).rejects.toThrow(`Block number ${syncedBlockNumber + 1} is higher than current block ${syncedBlockNumber}`);
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
