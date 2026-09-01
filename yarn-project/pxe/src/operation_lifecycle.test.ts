import type { Logger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { mock } from 'jest-mock-extended';

import { type OperationContributor, runOperation } from './operation_lifecycle.js';
import { type ChangeSetId, type StagedStore, StagedWriteCoordinator } from './storage/staged_write_coordinator.js';
import { tick } from './test_utils.js';

describe('runOperation', () => {
  let store: AztecAsyncKVStore;
  let coordinator: StagedWriteCoordinator;

  /** A staged store whose committed/discarded change sets are observable. */
  let committed: ChangeSetId[];
  let discarded: ChangeSetId[];

  beforeEach(async () => {
    store = await openTmpStore('operation_lifecycle_test');

    committed = [];
    discarded = [];
    const recordingStore: StagedStore = {
      storeName: 'recording_store',
      commitChangeSet: id => {
        committed.push(id);
        return Promise.resolve();
      },
      discardChangeSet: id => {
        discarded.push(id);
      },
    };
    coordinator = new StagedWriteCoordinator({ kvStore: store, stagedStores: [recordingStore] });
  });

  it('commits the change set and returns the result when the operation succeeds', async () => {
    const { changeSetId, operation } = run([], () => Promise.resolve('result'));

    await expect(operation).resolves.toEqual('result');
    expect(committed).toEqual([changeSetId]);
    expect(discarded).toEqual([]);
  });

  it('discards the change set when the operation rejects', async () => {
    const { changeSetId, operation } = run([], () => Promise.reject(new Error('operation failed')));

    await expect(operation).rejects.toThrow('operation failed');
    expect(committed).toEqual([]);
    expect(discarded).toEqual([changeSetId]);
  });

  it('waits for contributors to settle before committing', async () => {
    const { promise: settling, resolve: finishSettling } = promiseWithResolvers<void>();

    const { operation } = run([{ settle: () => settling, onOperationEnd: () => {} }], () => Promise.resolve());
    await tick();
    expect(committed).toEqual([]);

    finishSettling();
    await operation;
    expect(committed).toHaveLength(1);
  });

  it('discards instead of committing when a contributor fails to settle', async () => {
    const outcomes: string[] = [];
    const contributor: OperationContributor = {
      settle: () => Promise.reject(new Error('settle failed')),
      onOperationEnd: (_, outcome) => {
        outcomes.push(outcome);
      },
    };

    const { operation } = run([contributor], () => Promise.resolve());

    await expect(operation).rejects.toThrow('settle failed');
    expect(committed).toEqual([]);
    expect(discarded).toHaveLength(1);
    expect(outcomes).toEqual(['discarded']);
  });

  it('drains contributors before discarding on abort, even when settling fails', async () => {
    const { promise: settling, reject: failSettling } = promiseWithResolvers<void>();

    const { operation } = run([{ settle: () => settling, onOperationEnd: () => {} }], () =>
      Promise.reject(new Error('operation failed')),
    );
    await tick();
    expect(discarded).toEqual([]);

    failSettling(new Error('settle failed'));
    // The operation's own error surfaces, not the drain failure.
    await expect(operation).rejects.toThrow('operation failed');
    expect(discarded).toHaveLength(1);
  });

  it('notifies contributors of the outcome after the change set is decided', async () => {
    const events: string[] = [];
    const contributor: OperationContributor = {
      onOperationEnd: (id, outcome) => {
        const decided = (outcome === 'committed' ? committed : discarded).includes(id);
        events.push(`${outcome}:${decided ? 'after' : 'before'}`);
      },
    };

    await run([contributor], () => Promise.resolve()).operation;
    await expect(run([contributor], () => Promise.reject(new Error('fail'))).operation).rejects.toThrow('fail');

    expect(events).toEqual(['committed:after', 'discarded:after']);
  });

  it('keeps the decided outcome when a contributor fails to handle the end of the operation', async () => {
    const failing: OperationContributor = {
      onOperationEnd: () => {
        throw new Error('notification failed');
      },
    };
    const notified: string[] = [];
    const contributors: OperationContributor[] = [
      failing,
      {
        onOperationEnd: (_, outcome) => {
          notified.push(outcome);
        },
      },
    ];

    await expect(run(contributors, () => Promise.resolve('result')).operation).resolves.toEqual('result');
    await expect(run(contributors, () => Promise.reject(new Error('operation failed'))).operation).rejects.toThrow(
      'operation failed',
    );

    expect(committed).toHaveLength(1);
    expect(discarded).toHaveLength(1);
    expect(notified).toEqual(['committed', 'discarded']);
  });

  /** Begins a change set and runs `fn` as an operation over it. */
  function run<T>(contributors: OperationContributor[], fn: () => Promise<T>) {
    const changeSetId = coordinator.begin();
    const operation = runOperation(
      { stagedWriteCoordinator: coordinator, contributors, changeSetId, log: mockLog },
      fn,
    );
    return { changeSetId, operation };
  }

  const mockLog = mock<Logger>();
});
