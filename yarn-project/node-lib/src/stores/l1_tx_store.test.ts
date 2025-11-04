import { Blob } from '@aztec/blob-lib';
import { type L1TxState, TxUtilsState } from '@aztec/ethereum';
import { omit } from '@aztec/foundation/collection';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import type { Hex } from 'viem';

import { L1TxStore } from './l1_tx_store.js';

describe('L1TxStore', () => {
  let store: L1TxStore;
  let kvStore: AztecAsyncKVStore;
  let count = 0;

  beforeEach(async () => {
    kvStore = await openTmpStore(`l1-tx-store-test-${count++}`, true);
    store = new L1TxStore(kvStore);
  });

  afterEach(async () => {
    await store.close();
    if (kvStore) {
      await kvStore.close();
    }
  });

  const createMockState = (nonce: number, status: TxUtilsState = TxUtilsState.SENT): L1TxState => {
    const now = new Date();
    return {
      id: nonce,
      txHashes: [`0xabc${nonce}` as Hex],
      cancelTxHashes: [],
      gasLimit: 21000n,
      gasPrice: {
        maxFeePerGas: 1000000000n,
        maxPriorityFeePerGas: 1000000n,
      },
      txConfigOverrides: {},
      request: {
        to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        data: '0x' as `0x${string}`,
        value: 0n,
      },
      status,
      nonce,
      sentAtL1Ts: now,
      lastSentAtL1Ts: now,
      blobInputs: undefined,
    };
  };

  describe('saveState and loadStates', () => {
    it('should save and load transaction states for an account', async () => {
      const account = '0xabc123';
      const state1 = createMockState(1);
      const state2 = createMockState(2);

      await store.saveState(account, state1);
      await store.saveState(account, state2);

      const loaded = await store.loadStates(account);
      expect(loaded).toHaveLength(2);
      expect(loaded[0].nonce).toBe(1);
      expect(loaded[1].nonce).toBe(2);
      expect(loaded[0].gasLimit).toBe(21000n);
      expect(loaded[0].id).toBe(1);
      expect(loaded[1].id).toBe(2);
    });

    it('should return empty array for non-existent account', async () => {
      const loaded = await store.loadStates('0xnonexistent');
      expect(loaded).toEqual([]);
    });

    it('should assign auto-incremental IDs to states', async () => {
      const account = '0xabc123';

      const result1 = await store.saveState(account, createMockState(1));
      expect(result1.id).toBe(1);

      const result2 = await store.saveState(account, createMockState(2));
      expect(result2.id).toBe(2);

      const result3 = await store.saveState(account, createMockState(3));
      expect(result3.id).toBe(3);
    });

    it('should update existing state when ID is provided', async () => {
      const account = '0xabc123';

      const result1 = await store.saveState(account, createMockState(1));
      const stateId = result1.id;

      // Update the same state
      const updatedState = { ...createMockState(1), status: TxUtilsState.MINED, id: stateId } as L1TxState & {
        id: number;
      };
      await store.saveState(account, updatedState);

      const loaded = await store.loadStates(account);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe(stateId);
      expect(loaded[0].status).toBe(TxUtilsState.MINED);
    });

    it('should correctly serialize and deserialize dates', async () => {
      const account = '0xabc123';
      const sentAt = new Date('2024-01-01T00:00:00Z');
      const lastSentAt = new Date('2024-01-01T00:05:00Z');
      const state = {
        ...createMockState(1),
        sentAtL1Ts: sentAt,
        lastSentAtL1Ts: lastSentAt,
      };

      await store.saveState(account, state);

      const loaded = await store.loadStates(account);
      expect(loaded[0].sentAtL1Ts).toBeInstanceOf(Date);
      expect(loaded[0].sentAtL1Ts.getTime()).toBe(sentAt.getTime());
      expect(loaded[0].lastSentAtL1Ts.getTime()).toBe(lastSentAt.getTime());
    });

    it('should correctly serialize and deserialize bigints', async () => {
      const account = '0xabc123';
      const state = createMockState(1);
      state.gasLimit = 123456789012345n;
      state.gasPrice.maxFeePerGas = 987654321098765n;
      state.request.value = 5000000000000000000n;

      await store.saveState(account, state);

      const loaded = await store.loadStates(account);
      expect(loaded[0].gasLimit).toBe(123456789012345n);
      expect(loaded[0].gasPrice.maxFeePerGas).toBe(987654321098765n);
      expect(loaded[0].request.value).toBe(5000000000000000000n);
    });

    it('should correctly serialize and deserialize blob inputs', async () => {
      const account = '0xabc123';
      const blobData = new Uint8Array(131072).fill(1);
      const kzg = Blob.getViemKzgInstance();
      const state = createMockState(1);
      state.blobInputs = {
        blobs: [blobData],
        kzg,
        maxFeePerBlobGas: 1000000n,
      };

      await store.saveState(account, state);
      await store.saveBlobs(account, state.id, state.blobInputs);

      const loaded = await store.loadStates(account);
      expect(loaded[0].blobInputs).toBeDefined();
      expect(loaded[0].blobInputs!.blobs).toHaveLength(1);
      expect(loaded[0].blobInputs!.blobs[0]).toEqual(blobData);
      expect(loaded[0].blobInputs!.maxFeePerBlobGas).toBe(1000000n);
      expect(loaded[0].blobInputs!.kzg).toBeDefined();
    });

    it('should handle states with receipts', async () => {
      const account = '0xabc123';
      const state = createMockState(1);
      state.status = TxUtilsState.MINED;
      state.receipt = {
        transactionHash: '0xreceipt',
        blockNumber: 12345n,
        status: 'success',
        blockHash: '0xblockhash',
        cumulativeGasUsed: 21000n,
        effectiveGasPrice: 50000000000n,
        from: '0xfromaddress',
        to: '0xtoaddress',
        gasUsed: 21000n,
        logsBloom: '0xlogsbloom',
        type: 'eip1559',
        contractAddress: null,
        logs: [],
        transactionIndex: 1,
      };
      await store.saveState(account, state);

      const loaded = await store.loadStates(account);
      expect(loaded[0].receipt).toBeDefined();
      expect(loaded[0].receipt!.transactionHash).toBe('0xreceipt');
    });

    it('should load all states', async () => {
      const account = '0xabc123';

      await store.saveState(account, createMockState(1));
      await store.saveState(account, createMockState(2));
      await store.saveState(account, createMockState(3));
      await store.saveState(account, createMockState(4));
      await store.saveState(account, createMockState(5));

      await store.saveState('0xanother', createMockState(6));

      const loaded = await store.loadStates(account);
      expect(loaded).toHaveLength(5);
      expect(loaded[0].id).toBe(1);
      expect(loaded[1].id).toBe(2);
      expect(loaded[2].id).toBe(3);
      expect(loaded[3].id).toBe(4);
      expect(loaded[4].id).toBe(5);
    });
  });

  describe('loadState', () => {
    it('should load a single state by ID', async () => {
      const account = '0xabc123';

      const saved = await store.saveState(account, createMockState(1));
      const loaded = await store.loadState(account, saved.id);

      expect(loaded).toBeDefined();
      expect(loaded!.id).toBe(saved.id);
      expect(loaded!.nonce).toBe(1);
    });

    it('should return undefined for non-existent state ID', async () => {
      const account = '0xabc123';
      const loaded = await store.loadState(account, 999);
      expect(loaded).toBeUndefined();
    });
  });

  describe('saveBlobs', () => {
    it('should save and load blobs separately', async () => {
      const account = '0xabc123';
      const blobData = new Uint8Array(131072).fill(1);
      const kzg = Blob.getViemKzgInstance();

      // Save state without blobs
      const state = createMockState(1);
      const saved = await store.saveState(account, state);

      // Save blobs separately
      const blobInputs = {
        blobs: [blobData],
        kzg,
        maxFeePerBlobGas: 2000000n,
      };
      await store.saveBlobs(account, saved.id, blobInputs);

      // Update the state to indicate it has blobs
      state.blobInputs = blobInputs;
      await store.saveState(account, { ...state, id: saved.id });

      const loaded = await store.loadState(account, saved.id);
      expect(loaded!.blobInputs).toBeDefined();
      expect(loaded!.blobInputs!.blobs[0]).toEqual(blobData);
    });
  });

  describe('deleteState', () => {
    it('should delete a specific state', async () => {
      const account = '0xabc123';

      const saved1 = await store.saveState(account, createMockState(1));
      const saved2 = await store.saveState(account, createMockState(2));

      await store.deleteState(account, saved1.id);

      const loaded = await store.loadStates(account);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe(saved2.id);
    });

    it('should delete state and associated blobs', async () => {
      const account = '0xabc123';
      const blobData = new Uint8Array(131072).fill(1);
      const kzg = Blob.getViemKzgInstance();
      const state = createMockState(1);
      state.blobInputs = {
        blobs: [blobData],
        kzg,
      };

      const saved = await store.saveState(account, state);
      await store.deleteState(account, saved.id);

      const loaded = await store.loadState(account, saved.id);
      expect(loaded).toBeUndefined();
    });
  });

  describe('clearStates', () => {
    it('should clear all states for an account', async () => {
      const account = '0xabc123';
      await store.saveState(account, createMockState(1));
      await store.saveState(account, createMockState(2));

      expect(await store.loadStates(account)).toHaveLength(2);

      await store.clearStates(account);
      expect(await store.loadStates(account)).toHaveLength(0);
    });

    it('should not throw when clearing non-existent account', async () => {
      await expect(store.clearStates('0xnonexistent')).resolves.not.toThrow();
    });

    it('should reset ID counter when clearing states', async () => {
      const account = '0xabc123';
      const another = '0xdef456';

      await store.consumeNextStateId(account); // ID 1
      await store.consumeNextStateId(account); // ID 2
      await store.consumeNextStateId(another); // ID 1 for another account
      await store.consumeNextStateId(another); // ID 2 for another account
      await store.consumeNextStateId(another); // ID 3 for another account

      // Save some states
      await store.clearStates(account);

      // IDs should start from 1 again
      expect(await store.consumeNextStateId(account)).toBe(1);
      expect(await store.consumeNextStateId(another)).toBe(4); // Another account continues its own sequence
    });
  });

  describe('getAllAccounts', () => {
    it('should return empty array when no accounts exist', async () => {
      const accounts = await store.getAllAccounts();
      expect(accounts).toEqual([]);
    });

    it('should return all accounts with stored states', async () => {
      const account1 = '0xabc123';
      const account2 = '0xdef456';
      const account3 = '0x789xyz';

      await store.saveState(account1, createMockState(1));
      await store.saveState(account2, createMockState(2));
      await store.saveState(account3, createMockState(3));

      const accounts = await store.getAllAccounts();
      expect(accounts).toHaveLength(3);
      expect(accounts).toContain(account1);
      expect(accounts).toContain(account2);
      expect(accounts).toContain(account3);
    });
  });

  describe('multiple accounts', () => {
    it('should keep states separate per account', async () => {
      const account1 = '0xabc123';
      const account2 = '0xdef456';

      await store.saveState(account1, createMockState(1));
      await store.saveState(account1, createMockState(2));
      await store.saveState(account2, createMockState(3));
      await store.saveState(account2, createMockState(4));

      const loaded1 = await store.loadStates(account1);
      const loaded2 = await store.loadStates(account2);

      expect(loaded1).toHaveLength(2);
      expect(loaded2).toHaveLength(2);
      expect(loaded1[0].nonce).toBe(1);
      expect(loaded2[0].nonce).toBe(3);
    });

    it('should maintain separate ID counters per account', async () => {
      const account1 = '0xabc123';
      const account2 = '0xdef456';

      const state1 = await store.saveState(account1, createMockState(1));
      const state2 = await store.saveState(account2, createMockState(1));
      const state3 = await store.saveState(account1, createMockState(2));

      expect(state1.id).toBe(1);
      expect(state2.id).toBe(1); // Different account, so ID 1 again
      expect(state3.id).toBe(2); // Same account as state1
    });
  });

  describe('serialize/deserialize roundtrip', () => {
    it('should preserve all state fields through serialization', async () => {
      const account = '0xabc123';
      const blobData = new Uint8Array(131072).fill(1);
      const kzg = Blob.getViemKzgInstance();
      const stateToSave: L1TxState = {
        id: 1,
        txHashes: ['0xhash1' as Hex, '0xhash2' as Hex],
        cancelTxHashes: ['0xcancel1' as Hex],
        gasLimit: 123456n,
        gasPrice: {
          maxFeePerGas: 50000000000n,
          maxPriorityFeePerGas: 2000000000n,
          maxFeePerBlobGas: 1000000000n,
        },
        txConfigOverrides: {
          gasLimit: 200000n,
          txTimeoutMs: 60000,
          stallTimeMs: 12000,
          checkIntervalMs: 1000,
          maxSpeedUpAttempts: 5,
          cancelTxOnTimeout: true,
          txCancellationFinalTimeoutMs: 30000,
          txUnseenConsideredDroppedMs: 10000,
          priorityFeeRetryBumpPercentage: 25,
          txTimeoutAt: new Date('2024-12-31T23:59:59Z'),
        },
        request: {
          to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
          data: '0xabcdef' as `0x${string}`,
          value: 1000000000000000000n,
          abi: [{ name: 'test', type: 'function', inputs: [], outputs: [], stateMutability: 'view' }] as const,
        },
        status: TxUtilsState.SPEED_UP,
        nonce: 42,
        sentAtL1Ts: new Date('2024-01-01T10:00:00Z'),
        lastSentAtL1Ts: new Date('2024-01-01T10:05:00Z'),
        receipt: {
          transactionHash: '0xreceipt',
          blockNumber: 12345n,
          status: 'success',
          blockHash: '0xblockhash',
          cumulativeGasUsed: 21000n,
          effectiveGasPrice: 50000000000n,
          from: '0xfromaddress',
          to: '0xtoaddress',
          gasUsed: 21000n,
          logsBloom: '0xlogsbloom',
          type: 'eip1559',
          contractAddress: null,
          logs: [],
          transactionIndex: 1,
        },
        blobInputs: {
          blobs: [blobData],
          kzg,
          maxFeePerBlobGas: 5000000n,
        },
      };

      const originalState = await store.saveState(account, stateToSave);
      const loaded = await store.loadStates(account);

      expect(loaded).toHaveLength(1);
      const roundtrippedState = loaded[0];
      expect(omit(roundtrippedState, 'blobInputs', 'request')).toEqual(omit(originalState, 'blobInputs', 'request'));
      expect(omit(roundtrippedState.request, 'abi')).toEqual(omit(originalState.request, 'abi'));
    });
  });
});
