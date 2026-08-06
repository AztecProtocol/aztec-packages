import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { executeTimeout } from '@aztec/foundation/timer';
import { FunctionCall, FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { makeBlockHeader } from '@aztec/stdlib/testing';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import type { ContractStore } from '../storage/contract_store/contract_store.js';
import type { NoteStore } from '../storage/note_store/note_store.js';
import type { ContractClassService } from './contract_class_service.js';
import { ContractSyncService, MAX_CONCURRENT_SCOPE_SYNCS } from './contract_sync_service.js';

describe('ContractSyncService', () => {
  let aztecNode: ReturnType<typeof mock<AztecNode>>;
  let contractStore: ReturnType<typeof mock<ContractStore>>;
  let contractClassService: ReturnType<typeof mock<ContractClassService>>;
  let noteStore: ReturnType<typeof mock<NoteStore>>;
  let service: ContractSyncService;
  let utilityExecutor: jest.Mock<(call: FunctionCall, scopes: AztecAddress[]) => Promise<void>>;

  const contractAddress = AztecAddress.fromBigIntUnsafe(100n);
  const scopeA = AztecAddress.fromBigIntUnsafe(200n);
  const scopeB = AztecAddress.fromBigIntUnsafe(201n);
  const jobId = 'job-1';
  const anchorBlockHeader = makeBlockHeader(0);
  const classId = Fr.fromHexString('0xdeadbeef');

  beforeEach(() => {
    utilityExecutor = jest
      .fn<(call: FunctionCall, scopes: AztecAddress[]) => Promise<void>>()
      .mockResolvedValue(undefined);

    contractStore = mock<ContractStore>();
    contractStore.getFunctionCall.mockImplementation((_name, _args, address) =>
      Promise.resolve(
        FunctionCall.from({
          name: 'sync_state',
          to: address,
          selector: FunctionSelector.empty(),
          type: FunctionType.UTILITY,
          hideMsgSender: false,
          isStatic: false,
          args: [],
        }),
      ),
    );
    contractClassService = mock<ContractClassService>();
    contractClassService.getCurrentClassId.mockResolvedValue(classId);

    aztecNode = mock<AztecNode>();

    noteStore = mock<NoteStore>();
    // syncNoteNullifiers returns early when no notes
    noteStore.getNotes.mockResolvedValue([]);

    service = new ContractSyncService(
      aztecNode,
      contractStore,
      contractClassService,
      noteStore,
      createLogger('test:contract-sync'),
      false, // concurrentContractSyncEnabled
    );
  });

  describe('ensureContractSynced', () => {
    it('syncs a contract when not yet cached', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      expectSyncedScopes([scopeA]);
    });

    it('re-syncs after wipe', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      service.wipe();
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      expectSyncedScopes([scopeA], [scopeA]);
    });

    it('skips scope-specific syncs after syncing with all scopes', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [
        scopeA,
        scopeB,
      ]);
      // [scopeA, scopeB] syncs each scope individually
      expectSyncedScopes([scopeA], [scopeB]);

      // After syncing all scopes, scope-specific calls should be skipped
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeB]);
      expectSyncedScopes([scopeA], [scopeB]);
    });

    it('only syncs unsynced scopes when requesting multiple', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [
        scopeA,
        scopeB,
      ]);
      // scopeA is already cached, so only scopeB is synced
      expectSyncedScopes([scopeA], [scopeB]);
    });

    it('empty scopes array skips sync entirely', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, []);
      expectNoSync();
    });

    it('passes only unsynced scopes to the utility executor', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [
        scopeA,
        scopeB,
      ]);
      expectSyncedScopes([scopeA], [scopeB]);
    });

    it('concurrent calls for same contract+scope share one sync promise', async () => {
      const p1 = service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [
        scopeA,
      ]);
      const p2 = service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [
        scopeA,
      ]);
      await Promise.all([p1, p2]);
      expectSyncedScopes([scopeA]);
    });

    it('concurrent calls for different scopes trigger separate syncs', async () => {
      const p1 = service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [
        scopeA,
      ]);
      const p2 = service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [
        scopeB,
      ]);
      await Promise.all([p1, p2]);
      expectSyncedScopes([scopeA], [scopeB]);
    });

    // Regression test for the nested-sync deadlock. Each outer sync holds a slot while its sync_state triggers a
    // nested sync (a cross-contract utility call) that needs a slot of its own. With a single shared limiter, the
    // MAX_CONCURRENT_SCOPE_SYNCS outer syncs would hold every slot while awaiting nested syncs that can never
    // acquire one. Per-call limiters give the nested syncs their own slots, so the batch completes.
    it('does not deadlock when concurrent syncs each trigger a nested sync', async () => {
      const outerContracts = Array.from({ length: MAX_CONCURRENT_SCOPE_SYNCS }, (_, i) =>
        AztecAddress.fromBigIntUnsafe(1000n + BigInt(i)),
      );
      const nestedContracts = Array.from({ length: MAX_CONCURRENT_SCOPE_SYNCS }, (_, i) =>
        AztecAddress.fromBigIntUnsafe(2000n + BigInt(i)),
      );
      const nestedByOuter = new Map(outerContracts.map((outer, i) => [outer.toString(), nestedContracts[i]]));

      utilityExecutor.mockImplementation(async (call, scopes) => {
        const nested = nestedByOuter.get(call.to.toString());
        if (nested) {
          await service.ensureContractSynced(nested, null, utilityExecutor, anchorBlockHeader, jobId, scopes);
        }
      });

      const syncAll = Promise.all(
        outerContracts.map(outer =>
          service.ensureContractSynced(outer, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]),
        ),
      );

      await executeTimeout(() => syncAll, 2000, 'nested sync deadlock');
    });

    it('bounds the number of concurrently syncing scopes within a single call', async () => {
      const scopes = Array.from({ length: MAX_CONCURRENT_SCOPE_SYNCS + 3 }, (_, i) =>
        AztecAddress.fromBigIntUnsafe(500n + BigInt(i)),
      );

      let inFlight = 0;
      let peak = 0;
      const releases: Array<() => void> = [];
      utilityExecutor.mockImplementation(() => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        return new Promise<void>(resolve =>
          releases.push(() => {
            inFlight--;
            resolve();
          }),
        );
      });

      const syncAll = service.ensureContractSynced(
        contractAddress,
        null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes,
      );

      // The first wave saturates the limiter; the remaining scopes must queue rather than run.
      await tick();
      expect(inFlight).toBe(MAX_CONCURRENT_SCOPE_SYNCS);

      // Releasing one in-flight sync admits exactly one queued scope, so the cap is never exceeded.
      while (releases.length > 0) {
        releases.shift()!();
        await tick();
      }

      await syncAll;
      expect(peak).toBe(MAX_CONCURRENT_SCOPE_SYNCS);
      expect(utilityExecutor).toHaveBeenCalledTimes(scopes.length);
    });

    it('re-syncs if first sync fails', async () => {
      utilityExecutor.mockRejectedValueOnce(new Error('sync failed'));
      await expect(
        service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]),
      ).rejects.toThrow('sync failed');

      utilityExecutor.mockResolvedValueOnce(undefined);
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      // the following checks that we attempted sync twice
      expectSyncedScopes([scopeA], [scopeA]);
    });

    it('propagates sync errors to caller', async () => {
      utilityExecutor.mockRejectedValue(new Error('boom'));
      await expect(
        service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]),
      ).rejects.toThrow('boom');
    });
  });

  describe('commit', () => {
    it('does not clear sync cache', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      await service.commit(jobId);
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      // We check that the sync cache was not cleared by checking that the sync was triggered only once.
      expectSyncedScopes([scopeA]);
    });
  });

  describe('discardStaged', () => {
    it('clears sync cache', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      await service.discardStaged(jobId);
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      // We check that the sync cache was cleared by checking that the sync was triggered twice.
      expectSyncedScopes([scopeA], [scopeA]);
    });
  });

  describe('multi-scope sync batching', () => {
    it('batches nullifier sync across all unsynced scopes', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [
        scopeA,
        scopeB,
      ]);
      expect(noteStore.getNotes).toHaveBeenCalledTimes(1);
      expect(noteStore.getNotes).toHaveBeenCalledWith(
        expect.objectContaining({ contractAddress, scopes: [scopeA, scopeB] }),
        jobId,
      );
    });

    it('only includes unsynced scopes in nullifier sync', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      expect(noteStore.getNotes).toHaveBeenCalledTimes(1);
      expect(noteStore.getNotes).toHaveBeenCalledWith(
        expect.objectContaining({ contractAddress, scopes: [scopeA] }),
        jobId,
      );

      noteStore.getNotes.mockClear();
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [
        scopeA,
        scopeB,
      ]);
      // scopeA is already cached, so nullifier sync only runs for scopeB
      expect(noteStore.getNotes).toHaveBeenCalledTimes(1);
      expect(noteStore.getNotes).toHaveBeenCalledWith(
        expect.objectContaining({ contractAddress, scopes: [scopeB] }),
        jobId,
      );
    });

    it('re-runs nullifier sync after scope invalidation', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [
        scopeA,
        scopeB,
      ]);
      noteStore.getNotes.mockClear();

      service.invalidateContractForScopes(contractAddress, [scopeA]);
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [
        scopeA,
        scopeB,
      ]);
      // Only scopeA was invalidated, so nullifier sync runs for just scopeA
      expect(noteStore.getNotes).toHaveBeenCalledTimes(1);
      expect(noteStore.getNotes).toHaveBeenCalledWith(
        expect.objectContaining({ contractAddress, scopes: [scopeA] }),
        jobId,
      );
    });
  });

  describe('invalidateContractForScopes', () => {
    const contract2 = AztecAddress.fromBigIntUnsafe(300n);

    it('only invalidates the targeted scope', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [
        scopeA,
        scopeB,
      ]);
      expectSyncedScopes([scopeA], [scopeB]);

      service.invalidateContractForScopes(contractAddress, [scopeA]);

      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [
        scopeA,
        scopeB,
      ]);
      // Only scopeA should be re-synced, scopeB is still cached.
      expectSyncedScopes([scopeA], [scopeB], [scopeA]);
    });

    it('invalidates multiple scopes at once', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [
        scopeA,
        scopeB,
      ]);
      expectSyncedScopes([scopeA], [scopeB]);

      service.invalidateContractForScopes(contractAddress, [scopeA, scopeB]);

      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [
        scopeA,
        scopeB,
      ]);
      // Both scopes should be re-synced.
      expectSyncedScopes([scopeA], [scopeB], [scopeA], [scopeB]);
    });

    it('invalidating one scope does not affect the other', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [
        scopeA,
        scopeB,
      ]);
      expectSyncedScopes([scopeA], [scopeB]);

      // Syncing scopeA is a no-op because it's already cached.
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      expectSyncedScopes([scopeA], [scopeB]);

      // Invalidate scopeA only.
      service.invalidateContractForScopes(contractAddress, [scopeA]);

      // Now syncing scopeA triggers a re-sync.
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      expectSyncedScopes([scopeA], [scopeB], [scopeA]);

      // Syncing both scopes only re-syncs scopeA (already re-synced above is cached), scopeB is still cached.
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [
        scopeA,
        scopeB,
      ]);
      expectSyncedScopes([scopeA], [scopeB], [scopeA]);
    });

    it('empty scopes is a no-op', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [
        scopeA,
        scopeB,
      ]);
      expectSyncedScopes([scopeA], [scopeB]);

      service.invalidateContractForScopes(contractAddress, []);

      // Both scopes should still be cached since no scopes were invalidated.
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [
        scopeA,
        scopeB,
      ]);
      expectSyncedScopes([scopeA], [scopeB]);
    });

    it('does not affect other contracts', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      await service.ensureContractSynced(contract2, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      expectSyncedContracts([contractAddress, [scopeA]], [contract2, [scopeA]]);

      service.invalidateContractForScopes(contractAddress, [scopeA]);

      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      await service.ensureContractSynced(contract2, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      expectSyncedContracts([contractAddress, [scopeA]], [contract2, [scopeA]], [contractAddress, [scopeA]]);
    });
  });

  describe('speculative sync', () => {
    const otherContract = AztecAddress.fromBigIntUnsafe(101n);

    beforeEach(() => {
      service = new ContractSyncService(
        aztecNode,
        contractStore,
        contractClassService,
        noteStore,
        createLogger('test:contract-sync'),
        true, // concurrentContractSyncEnabled
      );
    });

    it('speculatively syncs contracts used by previous jobs of the same entry call', async () => {
      // Two jobs start with contractAddress, also use otherContract, and commit: otherContract's confidence reaches
      // the prediction threshold for that entry call.
      for (const id of [jobId, 'job-2']) {
        await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, id, [scopeA]);
        await service.ensureContractSynced(otherContract, null, utilityExecutor, anchorBlockHeader, id, [scopeA]);
        await service.commit(id);
      }
      // Wipe the sync cache (as an anchor block change would) so the next job's syncs run for real.
      service.wipe();
      utilityExecutor.mockClear();

      // A new job of the same entry call requests only contractAddress, yet otherContract syncs too.
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, 'job-3', [scopeA]);
      // The speculative sync runs in the background; yield so it reaches the executor.
      await tick();
      expectSyncedContracts([contractAddress, [scopeA]], [otherContract, [scopeA]]);
    });
  });

  /** Asserts the utility executor was called exactly with the given sequence of scope arrays. */
  const expectSyncedScopes = (...expectedScopes: AztecAddress[][]) => {
    expect(utilityExecutor).toHaveBeenCalledTimes(expectedScopes.length);
    for (let i = 0; i < expectedScopes.length; i++) {
      const [, actualScopes] = utilityExecutor.mock.calls[i];
      expect(actualScopes).toEqual(expectedScopes[i]);
    }
  };

  /** Asserts the utility executor was called exactly with the given sequence of [contractAddress, scopes] pairs. */
  const expectSyncedContracts = (...expected: [AztecAddress, AztecAddress[]][]) => {
    expect(utilityExecutor).toHaveBeenCalledTimes(expected.length);
    for (let i = 0; i < expected.length; i++) {
      const [call, actualScopes] = utilityExecutor.mock.calls[i];
      expect(call.to).toEqual(expected[i][0]);
      expect(actualScopes).toEqual(expected[i][1]);
    }
  };

  const expectNoSync = () => expect(utilityExecutor).not.toHaveBeenCalled();

  /** Yields to the macrotask queue, draining all pending microtasks (semaphore acquires/releases) in between. */
  const tick = () => new Promise<void>(resolve => setImmediate(resolve));
});
