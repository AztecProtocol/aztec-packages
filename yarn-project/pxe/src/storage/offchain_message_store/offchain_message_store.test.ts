import type { IncomingOffchainMessage } from '@aztec/aztec.js/wallet';
import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxHash } from '@aztec/stdlib/tx';

import { OffchainMessageStore } from './offchain_message_store.js';

describe('OffchainMessageStore', () => {
  let store: OffchainMessageStore;

  const JOB_ID = 'test-job-1';
  let nextId = 0;

  const makeMessage = async (
    overrides: Partial<IncomingOffchainMessage> & { contractAddress?: AztecAddress } = {},
  ): Promise<IncomingOffchainMessage> => {
    const contractAddress = overrides.contractAddress ?? (await AztecAddress.random());
    return {
      offchainEffect: overrides.offchainEffect ?? {
        data: [Fr.random(), Fr.random(), Fr.random()],
        contractAddress,
      },
      txHash: overrides.txHash ?? TxHash.random(),
      appMessageId: overrides.appMessageId ?? `msg-${nextId++}`,
    };
  };

  const storeKey = (msg: IncomingOffchainMessage) => `${msg.offchainEffect.contractAddress}|${msg.appMessageId}`;

  beforeEach(async () => {
    const kvStore = await openTmpStore('offchain_message_store_test');
    store = new OffchainMessageStore(kvStore);
  });

  describe('addIncomingMessages', () => {
    it('stores messages and retrieves them by contract address', async () => {
      const contractAddress = await AztecAddress.random();
      const msg = await makeMessage({ contractAddress });

      await store.addIncomingMessages([msg]);

      const results = await store.getPendingByContract(contractAddress);
      expect(results).toHaveLength(1);
      expect(results[0].offchainEffect.contractAddress.equals(contractAddress)).toBe(true);
      expect(results[0].offchainEffect.data.length).toBe(msg.offchainEffect.data.length);
      expect(results[0].txHash.equals(msg.txHash)).toBe(true);
      expect(results[0].appMessageId).toBe(msg.appMessageId);
    });

    it('deduplicates messages with the same key', async () => {
      const contractAddress = await AztecAddress.random();
      const msg = await makeMessage({ contractAddress });

      await store.addIncomingMessages([msg]);
      await store.addIncomingMessages([msg]); // same message again

      const results = await store.getPendingByContract(contractAddress);
      expect(results).toHaveLength(1);
    });

    it('stores multiple messages for the same contract', async () => {
      const contractAddress = await AztecAddress.random();
      const msg1 = await makeMessage({ contractAddress });
      const msg2 = await makeMessage({ contractAddress });

      await store.addIncomingMessages([msg1, msg2]);

      const results = await store.getPendingByContract(contractAddress);
      expect(results).toHaveLength(2);
    });

    it('stores messages for different contracts separately', async () => {
      const contract1 = await AztecAddress.random();
      const contract2 = await AztecAddress.random();
      const msg1 = await makeMessage({ contractAddress: contract1 });
      const msg2 = await makeMessage({ contractAddress: contract2 });

      await store.addIncomingMessages([msg1, msg2]);

      const results1 = await store.getPendingByContract(contract1);
      expect(results1).toHaveLength(1);
      expect(results1[0].offchainEffect.contractAddress.equals(contract1)).toBe(true);

      const results2 = await store.getPendingByContract(contract2);
      expect(results2).toHaveLength(1);
      expect(results2[0].offchainEffect.contractAddress.equals(contract2)).toBe(true);
    });
  });

  describe('getPendingByContract', () => {
    it('returns empty array when no messages exist', async () => {
      const contractAddress = await AztecAddress.random();
      const results = await store.getPendingByContract(contractAddress);
      expect(results).toEqual([]);
    });

    it('only returns messages with pending status after commit', async () => {
      const contractAddress = await AztecAddress.random();
      const msg1 = await makeMessage({ contractAddress });
      const msg2 = await makeMessage({ contractAddress });
      const msg3 = await makeMessage({ contractAddress });

      await store.addIncomingMessages([msg1, msg2, msg3]);

      const allPending = await store.getPendingByContract(contractAddress);
      expect(allPending).toHaveLength(3);

      // Stage status changes
      store.markProcessed([storeKey(allPending[0])], JOB_ID);
      store.markInvalid([storeKey(allPending[1])], JOB_ID);

      // Commit so status changes are persisted
      await store.commit(JOB_ID);

      // Only the third should still be pending
      const remaining = await store.getPendingByContract(contractAddress);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].appMessageId).toBe(allPending[2].appMessageId);
    });

    it('excludes staged non-pending messages when jobId is provided', async () => {
      const contractAddress = await AztecAddress.random();
      const msg1 = await makeMessage({ contractAddress });
      const msg2 = await makeMessage({ contractAddress });

      await store.addIncomingMessages([msg1, msg2]);
      const allPending = await store.getPendingByContract(contractAddress);
      expect(allPending).toHaveLength(2);

      // Stage first message as processed (not yet committed)
      store.markProcessed([storeKey(allPending[0])], JOB_ID);

      // Without jobId: both still appear (staged changes not committed yet)
      const withoutJobId = await store.getPendingByContract(contractAddress);
      expect(withoutJobId).toHaveLength(2);

      // With jobId: staged message is excluded
      const withJobId = await store.getPendingByContract(contractAddress, JOB_ID);
      expect(withJobId).toHaveLength(1);
      expect(withJobId[0].appMessageId).toBe(allPending[1].appMessageId);
    });
  });

  describe('markProcessed', () => {
    it('marks messages as processed after commit', async () => {
      const contractAddress = await AztecAddress.random();
      const msg = await makeMessage({ contractAddress });

      await store.addIncomingMessages([msg]);
      const pending = await store.getPendingByContract(contractAddress);
      expect(pending).toHaveLength(1);

      store.markProcessed([storeKey(pending[0])], JOB_ID);
      await store.commit(JOB_ID);

      const afterCommit = await store.getPendingByContract(contractAddress);
      expect(afterCommit).toHaveLength(0);
    });

    it('marks multiple messages as processed', async () => {
      const contractAddress = await AztecAddress.random();
      const msg1 = await makeMessage({ contractAddress });
      const msg2 = await makeMessage({ contractAddress });
      const msg3 = await makeMessage({ contractAddress });

      await store.addIncomingMessages([msg1, msg2, msg3]);
      const pending = await store.getPendingByContract(contractAddress);
      expect(pending).toHaveLength(3);

      store.markProcessed([storeKey(pending[0]), storeKey(pending[1])], JOB_ID);
      await store.commit(JOB_ID);

      const afterCommit = await store.getPendingByContract(contractAddress);
      expect(afterCommit).toHaveLength(1);
      expect(afterCommit[0].appMessageId).toBe(pending[2].appMessageId);
    });

    it('is idempotent - marking already processed messages does not throw', async () => {
      const contractAddress = await AztecAddress.random();
      const msg = await makeMessage({ contractAddress });

      await store.addIncomingMessages([msg]);
      const pending = await store.getPendingByContract(contractAddress);

      store.markProcessed([storeKey(pending[0])], JOB_ID);
      await store.commit(JOB_ID);

      // Mark again with a new job — already processed in DB, but staging doesn't throw
      store.markProcessed([storeKey(pending[0])], 'job-2');
      await expect(store.commit('job-2')).resolves.not.toThrow();
    });
  });

  describe('markInvalid', () => {
    it('marks messages as invalid after commit', async () => {
      const contractAddress = await AztecAddress.random();
      const msg = await makeMessage({ contractAddress });

      await store.addIncomingMessages([msg]);
      const pending = await store.getPendingByContract(contractAddress);
      expect(pending).toHaveLength(1);

      store.markInvalid([storeKey(pending[0])], JOB_ID);
      await store.commit(JOB_ID);

      const afterCommit = await store.getPendingByContract(contractAddress);
      expect(afterCommit).toHaveLength(0);
    });
  });

  describe('markExpired', () => {
    it('marks messages as expired after commit', async () => {
      const contractAddress = await AztecAddress.random();
      const msg = await makeMessage({ contractAddress });

      await store.addIncomingMessages([msg]);
      const pending = await store.getPendingByContract(contractAddress);
      expect(pending).toHaveLength(1);

      store.markExpired([storeKey(pending[0])], JOB_ID);
      await store.commit(JOB_ID);

      const afterCommit = await store.getPendingByContract(contractAddress);
      expect(afterCommit).toHaveLength(0);
    });
  });

  describe('markExpiredIfStale', () => {
    it('expires a message older than maxAgeMs', async () => {
      const contractAddress = await AztecAddress.random();
      const msg = await makeMessage({ contractAddress });

      await store.addIncomingMessages([msg]);
      const pending = await store.getPendingByContract(contractAddress);
      expect(pending).toHaveLength(1);

      // maxAgeMs = 0 means anything ingested in the past is stale
      const expired = await store.markExpiredIfStale(storeKey(pending[0]), 0, JOB_ID);
      expect(expired).toBe(true);

      await store.commit(JOB_ID);
      const afterCommit = await store.getPendingByContract(contractAddress);
      expect(afterCommit).toHaveLength(0);
    });

    it('does not expire a recent message', async () => {
      const contractAddress = await AztecAddress.random();
      const msg = await makeMessage({ contractAddress });

      await store.addIncomingMessages([msg]);
      const pending = await store.getPendingByContract(contractAddress);
      expect(pending).toHaveLength(1);

      // maxAgeMs is very large, so the message is not stale
      const expired = await store.markExpiredIfStale(storeKey(pending[0]), 999_999_999, JOB_ID);
      expect(expired).toBe(false);

      const stillPending = await store.getPendingByContract(contractAddress);
      expect(stillPending).toHaveLength(1);
    });

    it('returns false for a nonexistent key', async () => {
      const expired = await store.markExpiredIfStale('nonexistent', 0, JOB_ID);
      expect(expired).toBe(false);
    });
  });

  describe('staged behavior', () => {
    it('does not persist status changes until commit', async () => {
      const contractAddress = await AztecAddress.random();
      const msg = await makeMessage({ contractAddress });

      await store.addIncomingMessages([msg]);
      const pending = await store.getPendingByContract(contractAddress);
      expect(pending).toHaveLength(1);

      // Stage but do not commit
      store.markProcessed([storeKey(pending[0])], JOB_ID);

      // Without jobId, message is still pending in DB
      const stillPending = await store.getPendingByContract(contractAddress);
      expect(stillPending).toHaveLength(1);
    });

    it('discardStaged drops staged changes without persisting', async () => {
      const contractAddress = await AztecAddress.random();
      const msg = await makeMessage({ contractAddress });

      await store.addIncomingMessages([msg]);
      const pending = await store.getPendingByContract(contractAddress);
      expect(pending).toHaveLength(1);

      store.markProcessed([storeKey(pending[0])], JOB_ID);

      // Staged change visible with jobId
      const withJobId = await store.getPendingByContract(contractAddress, JOB_ID);
      expect(withJobId).toHaveLength(0);

      // Discard staged changes
      await store.discardStaged(JOB_ID);

      // Message is back to pending even with the same jobId
      const afterDiscard = await store.getPendingByContract(contractAddress, JOB_ID);
      expect(afterDiscard).toHaveLength(1);
    });

    it('isolates staged changes between different jobs', async () => {
      const contractAddress = await AztecAddress.random();
      const msg1 = await makeMessage({ contractAddress });
      const msg2 = await makeMessage({ contractAddress });

      await store.addIncomingMessages([msg1, msg2]);
      const pending = await store.getPendingByContract(contractAddress);
      expect(pending).toHaveLength(2);

      // Job A stages first message
      store.markProcessed([storeKey(pending[0])], 'job-a');
      // Job B stages second message
      store.markProcessed([storeKey(pending[1])], 'job-b');

      // Each job only sees its own staged changes
      const jobAView = await store.getPendingByContract(contractAddress, 'job-a');
      expect(jobAView).toHaveLength(1);
      expect(jobAView[0].appMessageId).toBe(pending[1].appMessageId);

      const jobBView = await store.getPendingByContract(contractAddress, 'job-b');
      expect(jobBView).toHaveLength(1);
      expect(jobBView[0].appMessageId).toBe(pending[0].appMessageId);
    });

    it('commit with no staged changes is a no-op', async () => {
      await expect(store.commit('nonexistent-job')).resolves.not.toThrow();
    });

    it('discardStaged with no staged changes is a no-op', async () => {
      await expect(store.discardStaged('nonexistent-job')).resolves.not.toThrow();
    });
  });

  describe('deduplication key', () => {
    it('produces different keys for different appMessageIds', async () => {
      const contractAddress = await AztecAddress.random();

      const msg1 = await makeMessage({ contractAddress, appMessageId: 'id-a' });
      const msg2 = await makeMessage({ contractAddress, appMessageId: 'id-b' });

      await store.addIncomingMessages([msg1, msg2]);

      const results = await store.getPendingByContract(contractAddress);
      expect(results).toHaveLength(2);
      expect(results[0].appMessageId).not.toBe(results[1].appMessageId);
    });

    it('produces different keys for same appMessageId on different contracts', async () => {
      const contract1 = await AztecAddress.random();
      const contract2 = await AztecAddress.random();

      const msg1 = await makeMessage({ contractAddress: contract1, appMessageId: 'same-id' });
      const msg2 = await makeMessage({ contractAddress: contract2, appMessageId: 'same-id' });

      await store.addIncomingMessages([msg1, msg2]);

      const results1 = await store.getPendingByContract(contract1);
      const results2 = await store.getPendingByContract(contract2);
      expect(results1).toHaveLength(1);
      expect(results2).toHaveLength(1);
    });

    it('deduplicates messages with the same contractAddress and appMessageId', async () => {
      const contractAddress = await AztecAddress.random();

      const msg1 = await makeMessage({ contractAddress, appMessageId: 'dup-id' });
      const msg2 = await makeMessage({ contractAddress, appMessageId: 'dup-id' });

      await store.addIncomingMessages([msg1]);
      await store.addIncomingMessages([msg2]);

      const results = await store.getPendingByContract(contractAddress);
      expect(results).toHaveLength(1);
    });
  });

  describe('persistence', () => {
    it('data survives store reconstruction from the same underlying kv store', async () => {
      const kvStore = await openTmpStore('offchain_persistence_test');
      const store1 = new OffchainMessageStore(kvStore);

      const contractAddress = await AztecAddress.random();
      const msg = await makeMessage({ contractAddress });

      await store1.addIncomingMessages([msg]);

      // Create a new store instance on the same kv store
      const store2 = new OffchainMessageStore(kvStore);
      const results = await store2.getPendingByContract(contractAddress);
      expect(results).toHaveLength(1);
      expect(results[0].appMessageId).toBe(msg.appMessageId);
    });
  });
});
