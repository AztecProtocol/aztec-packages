import { jest } from '@jest/globals';

import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { KeyStore } from '@aztec/key-store';
import type {
  AddressStore,
  CapsuleStore,
  ContractStore,
  NoteStore,
  PrivateEventStore,
  RecipientTaggingStore,
  SenderAddressBookStore,
  SenderTaggingStore,
} from '@aztec/pxe/server';
import type { StateReference } from '@aztec/stdlib/interfaces/server';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { BlockHeader, GlobalVariables } from '@aztec/stdlib/tx';

import type { TXEStateMachine } from '../state_machine/index.js';
import type { TXESynchronizer } from '../state_machine/synchronizer.js';
import type { TXEAccountStore } from '../util/txe_account_store.js';
import { TXEOracleTopLevelContext } from './txe_oracle_top_level_context.js';

describe('TXEOracleTopLevelContext', () => {
  describe('mineBlock', () => {
    it('calls handleL2Block before closing the forked world trees', async () => {
      // Track the order of async operations
      const callOrder: string[] = [];

      const mockForkedWorldTrees = {
        appendLeaves: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        batchInsert: jest.fn<() => Promise<any>>().mockResolvedValue({ sortedNewLeaves: [], lowLeavesWitnessData: [] }),
        getStateReference: jest.fn<() => Promise<StateReference>>().mockResolvedValue({} as StateReference),
        getTreeInfo: jest.fn<() => Promise<any>>().mockResolvedValue({ root: Fr.ZERO.toBuffer(), size: 1n }),
        updateArchive: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        [Symbol.asyncDispose]: jest.fn<() => Promise<void>>().mockImplementation(async () => {
          callOrder.push('dispose');
        }),
      };

      const mockNativeWorldStateService = {
        fork: jest.fn<() => Promise<typeof mockForkedWorldTrees>>().mockResolvedValue(mockForkedWorldTrees),
      };

      const mockSynchronizer = {
        nativeWorldStateService: mockNativeWorldStateService,
      } as unknown as TXESynchronizer;

      const mockStateMachine = {
        synchronizer: mockSynchronizer,
        handleL2Block: jest.fn<() => Promise<void>>().mockImplementation(async () => {
          callOrder.push('handleL2Block');
        }),
        node: {
          getBlockHeader: jest.fn<() => Promise<BlockHeader | undefined>>().mockResolvedValue({
            globalVariables: { blockNumber: BlockNumber(0) } as unknown as GlobalVariables,
          } as BlockHeader),
        },
      } as unknown as TXEStateMachine;

      const oracle = new TXEOracleTopLevelContext(
        mockStateMachine,
        {} as ContractStore,
        {} as NoteStore,
        {} as KeyStore,
        {} as AddressStore,
        {} as TXEAccountStore,
        {} as SenderTaggingStore,
        {} as RecipientTaggingStore,
        {} as SenderAddressBookStore,
        {} as CapsuleStore,
        {} as PrivateEventStore,
        100n, // nextBlockTimestamp
        new Fr(1), // version
        new Fr(1), // chainId
        new Map<string, AuthWitness>(),
      );

      await oracle.mineBlock();

      // Verify both operations were called
      expect(mockStateMachine.handleL2Block).toHaveBeenCalledTimes(1);
      expect(mockForkedWorldTrees[Symbol.asyncDispose]).toHaveBeenCalledTimes(1);

      // Verify the correct ordering: handleL2Block MUST be called BEFORE dispose
      expect(callOrder).toEqual(['handleL2Block', 'dispose']);
    });
  });
});
