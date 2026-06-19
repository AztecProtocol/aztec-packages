import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { executeTimeout } from '@aztec/foundation/timer';
import { FunctionCall, FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { makeBlockHeader } from '@aztec/stdlib/testing';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import type { ContractStore } from '../storage/contract_store/contract_store.js';
import type { NoteStore } from '../storage/note_store/note_store.js';
import { ContractSyncService, MAX_CONCURRENT_SCOPE_SYNCS } from './contract_sync_service.js';

describe('ContractSyncService', () => {
  let aztecNode: ReturnType<typeof mock<AztecNode>>;
  let contractStore: ReturnType<typeof mock<ContractStore>>;
  let noteStore: ReturnType<typeof mock<NoteStore>>;
  let service: ContractSyncService;
  let utilityExecutor: jest.Mock<(call: FunctionCall, scopes: AztecAddress[]) => Promise<void>>;

  const contractAddress = AztecAddress.fromBigInt(100n);
  const scopeA = AztecAddress.fromBigInt(200n);
  const scopeB = AztecAddress.fromBigInt(201n);
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
          returnTypes: [],
        }),
      ),
    );
    contractStore.getContractInstance.mockResolvedValue({
      currentContractClassId: classId,
      originalContractClassId: classId,
      address: contractAddress,
    } as ContractInstanceWithAddress);

    aztecNode = mock<AztecNode>();
    // verifyCurrentClassId reads the instance from the node at the anchor block; returning undefined causes
    // readCurrentClassId to fall back to the local originalContractClassId, which matches so verification passes.
    aztecNode.getContract.mockResolvedValue(undefined);

    noteStore = mock<NoteStore>();
    // syncNoteNullifiers returns early when no notes
    noteStore.getNotes.mockResolvedValue([]);

    service = new ContractSyncService(aztecNode, contractStore, noteStore, createLogger('test:contract-sync'));
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
        AztecAddress.fromBigInt(1000n + BigInt(i)),
      );
      const nestedContracts = Array.from({ length: MAX_CONCURRENT_SCOPE_SYNCS }, (_, i) =>
        AztecAddress.fromBigInt(2000n + BigInt(i)),
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
        AztecAddress.fromBigInt(500n + BigInt(i)),
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

  describe('class ID verification deduplication', () => {
    const contract2 = AztecAddress.fromBigInt(300n);

    it('verifies class ID only once per contract across scope batches', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeB]);
      expectVerifiedContracts(contractAddress);
    });

    it('verifies class ID separately for different contracts', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      await service.ensureContractSynced(contract2, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      expectVerifiedContracts(contractAddress, contract2);
    });

    it('re-verifies class ID after wipe', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      service.wipe();
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeB]);
      expectVerifiedContracts(contractAddress, contractAddress);
    });

    it('re-verifies class ID after discardStaged', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      await service.discardStaged(jobId);
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      expectVerifiedContracts(contractAddress, contractAddress);
    });

    it('re-verifies class ID after verification failure', async () => {
      contractStore.getContractInstance.mockRejectedValueOnce(new Error('node unavailable'));
      await expect(
        service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]),
      ).rejects.toThrow('node unavailable');

      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      expectVerifiedContracts(contractAddress, contractAddress);
    });

    it('does not re-verify class ID when only scope cache is invalidated', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      service.invalidateContractForScopes(contractAddress, [scopeA]);
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      expectVerifiedContracts(contractAddress);
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
    const contract2 = AztecAddress.fromBigInt(300n);

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

  /** Asserts that class ID verification was triggered for each contract address in the given sequence. */
  const expectVerifiedContracts = (...addresses: AztecAddress[]) => {
    expect(contractStore.getContractInstance).toHaveBeenCalledTimes(addresses.length);
    for (let i = 0; i < addresses.length; i++) {
      expect(contractStore.getContractInstance).toHaveBeenNthCalledWith(i + 1, addresses[i]);
    }
  };

  const expectNoSync = () => expect(utilityExecutor).not.toHaveBeenCalled();

  /** Yields to the macrotask queue, draining all pending microtasks (semaphore acquires/releases) in between. */
  const tick = () => new Promise<void>(resolve => setImmediate(resolve));
});
