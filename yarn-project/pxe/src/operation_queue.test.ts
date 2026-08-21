import type { Logger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { BlockHeader } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { BlockSynchronizer } from './block_synchronizer/index.js';
import type { Recording } from './node/benchmarked_node.js';
import type { CachingAztecNode } from './node/caching_aztec_node.js';
import { OperationQueue } from './operation_queue.js';
import type { AnchorBlockStore } from './storage/anchor_block_store/anchor_block_store.js';
import { type ChangeSetId, type StagedStore, StagedWriteCoordinator } from './storage/staged_write_coordinator.js';

describe('OperationQueue', () => {
  let store: AztecAsyncKVStore;
  let coordinator: StagedWriteCoordinator;
  let node: MockProxy<CachingAztecNode>;
  let synchronizer: MockProxy<BlockSynchronizer>;
  let anchorBlockStore: MockProxy<AnchorBlockStore>;

  /** A staged store whose committed/discarded change sets are observable. */
  let committed: ChangeSetId[];
  let discarded: ChangeSetId[];

  beforeEach(async () => {
    store = await openTmpStore('operation_queue_test');

    committed = [];
    discarded = [];
    const recordingStore: StagedStore = {
      storeName: 'recording_store',
      commitStaged: id => {
        committed.push(id);
        return Promise.resolve();
      },
      discardStaged: id => {
        discarded.push(id);
        return Promise.resolve();
      },
    };
    coordinator = new StagedWriteCoordinator({ kvStore: store, stagedStores: [recordingStore] });

    node = mock<CachingAztecNode>();
    node.startRecording.mockReturnValue(mock<Recording>());
    synchronizer = mock<BlockSynchronizer>();
    anchorBlockStore = mock<AnchorBlockStore>();
    anchorBlockStore.getBlockHeader.mockResolvedValue(BlockHeader.empty());
  });

  it('commits the change set when the operation succeeds', async () => {
    const queue = makeQueue();

    const result = await queue.runSynced(({ changeSetId }) => Promise.resolve(changeSetId));

    expect(committed).toEqual([result]);
    expect(discarded).toEqual([]);
  });

  it('discards the change set when the operation rejects', async () => {
    const queue = makeQueue();
    let id: ChangeSetId;

    await expect(
      queue.runSynced(({ changeSetId }) => {
        id = changeSetId;
        return Promise.reject(new Error('operation failed'));
      }),
    ).rejects.toThrow('operation failed');

    expect(committed).toEqual([]);
    expect(discarded).toEqual([id!]);
  });

  function makeQueue() {
    const queue = new OperationQueue({
      node,
      synchronizer,
      anchorBlockStore,
      stagedWriteCoordinator: coordinator,
      contributors: [],
      autoSync: false,
      log: mockLog,
    });
    queue.start();
    return queue;
  }

  const mockLog = mock<Logger>();
});
