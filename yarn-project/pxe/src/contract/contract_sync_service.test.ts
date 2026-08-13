import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { executeTimeout } from '@aztec/foundation/timer';
import { TestContractArtifact } from '@aztec/noir-test-contracts.js/Test';
import { FunctionCall, FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { makeBlockHeader } from '@aztec/stdlib/testing';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import type { ContractStore } from '../storage/contract_store/contract_store.js';
import type { NoteStore } from '../storage/note_store/note_store.js';
import { type ContractFunction, PREDICTION_THRESHOLD } from './contract_call_graph.js';
import type { ContractClassService } from './contract_class_service.js';
import { ContractSyncService, MAX_CONCURRENT_SCOPE_SYNCS, SYNC_STATE_SELECTOR } from './contract_sync_service.js';

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
          returnTypes: [],
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
      { concurrentContractSyncEnabled: false },
    );
  });

  describe('ensureContractSynced', () => {
    it('syncs a contract when not yet cached', async () => {
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      expectSyncedScopes([scopeA]);
    });

    it('re-syncs after wipe', async () => {
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      service.wipe();
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      expectSyncedScopes([scopeA], [scopeA]);
    });

    it('skips scope-specific syncs after syncing with all scopes', async () => {
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA, scopeB],
        triggeredBy: undefined,
      });
      // [scopeA, scopeB] syncs each scope individually
      expectSyncedScopes([scopeA], [scopeB]);

      // After syncing all scopes, scope-specific calls should be skipped
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeB],
        triggeredBy: undefined,
      });
      expectSyncedScopes([scopeA], [scopeB]);
    });

    it('only syncs unsynced scopes when requesting multiple', async () => {
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA, scopeB],
        triggeredBy: undefined,
      });
      // scopeA is already cached, so only scopeB is synced
      expectSyncedScopes([scopeA], [scopeB]);
    });

    it('empty scopes array skips sync entirely', async () => {
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [],
        triggeredBy: undefined,
      });
      expectNoSync();
    });

    it('passes only unsynced scopes to the utility executor', async () => {
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA, scopeB],
        triggeredBy: undefined,
      });
      expectSyncedScopes([scopeA], [scopeB]);
    });

    it('concurrent calls for same contract+scope share one sync promise', async () => {
      const p1 = service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      const p2 = service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      await Promise.all([p1, p2]);
      expectSyncedScopes([scopeA]);
    });

    it('concurrent calls for different scopes trigger separate syncs', async () => {
      const p1 = service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      const p2 = service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeB],
        triggeredBy: undefined,
      });
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
          await service.ensureContractSynced({
            contract: nested,
            functionToInvokeAfterSync: null,
            utilityExecutor,
            anchorBlockHeader,
            jobId,
            scopes,
            triggeredBy: undefined,
          });
        }
      });

      const syncAll = Promise.all(
        outerContracts.map(outer =>
          service.ensureContractSynced({
            contract: outer,
            functionToInvokeAfterSync: null,
            utilityExecutor,
            anchorBlockHeader,
            jobId,
            scopes: [scopeA],
            triggeredBy: undefined,
          }),
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

      const syncAll = service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes,
        triggeredBy: undefined,
      });

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
        service.ensureContractSynced({
          contract: contractAddress,
          functionToInvokeAfterSync: null,
          utilityExecutor,
          anchorBlockHeader,
          jobId,
          scopes: [scopeA],
          triggeredBy: undefined,
        }),
      ).rejects.toThrow('sync failed');

      utilityExecutor.mockResolvedValueOnce(undefined);
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      // the following checks that we attempted sync twice
      expectSyncedScopes([scopeA], [scopeA]);
    });

    it('propagates sync errors to caller', async () => {
      utilityExecutor.mockRejectedValue(new Error('boom'));
      await expect(
        service.ensureContractSynced({
          contract: contractAddress,
          functionToInvokeAfterSync: null,
          utilityExecutor,
          anchorBlockHeader,
          jobId,
          scopes: [scopeA],
          triggeredBy: undefined,
        }),
      ).rejects.toThrow('boom');
    });
  });

  describe('commit', () => {
    it('does not clear sync cache', async () => {
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      await service.commit(jobId);
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      // We check that the sync cache was not cleared by checking that the sync was triggered only once.
      expectSyncedScopes([scopeA]);
    });
  });

  describe('discardStaged', () => {
    it('clears sync cache', async () => {
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      await service.discardStaged(jobId);
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      // We check that the sync cache was cleared by checking that the sync was triggered twice.
      expectSyncedScopes([scopeA], [scopeA]);
    });
  });

  describe('multi-scope sync batching', () => {
    it('batches nullifier sync across all unsynced scopes', async () => {
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA, scopeB],
        triggeredBy: undefined,
      });
      expect(noteStore.getNotes).toHaveBeenCalledTimes(1);
      expect(noteStore.getNotes).toHaveBeenCalledWith(
        expect.objectContaining({ contractAddress, scopes: [scopeA, scopeB] }),
        jobId,
      );
    });

    it('only includes unsynced scopes in nullifier sync', async () => {
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      expect(noteStore.getNotes).toHaveBeenCalledTimes(1);
      expect(noteStore.getNotes).toHaveBeenCalledWith(
        expect.objectContaining({ contractAddress, scopes: [scopeA] }),
        jobId,
      );

      noteStore.getNotes.mockClear();
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA, scopeB],
        triggeredBy: undefined,
      });
      // scopeA is already cached, so nullifier sync only runs for scopeB
      expect(noteStore.getNotes).toHaveBeenCalledTimes(1);
      expect(noteStore.getNotes).toHaveBeenCalledWith(
        expect.objectContaining({ contractAddress, scopes: [scopeB] }),
        jobId,
      );
    });

    it('re-runs nullifier sync after scope invalidation', async () => {
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA, scopeB],
        triggeredBy: undefined,
      });
      noteStore.getNotes.mockClear();

      service.invalidateContractForScopes(contractAddress, [scopeA]);
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA, scopeB],
        triggeredBy: undefined,
      });
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
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA, scopeB],
        triggeredBy: undefined,
      });
      expectSyncedScopes([scopeA], [scopeB]);

      service.invalidateContractForScopes(contractAddress, [scopeA]);

      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA, scopeB],
        triggeredBy: undefined,
      });
      // Only scopeA should be re-synced, scopeB is still cached.
      expectSyncedScopes([scopeA], [scopeB], [scopeA]);
    });

    it('invalidates multiple scopes at once', async () => {
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA, scopeB],
        triggeredBy: undefined,
      });
      expectSyncedScopes([scopeA], [scopeB]);

      service.invalidateContractForScopes(contractAddress, [scopeA, scopeB]);

      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA, scopeB],
        triggeredBy: undefined,
      });
      // Both scopes should be re-synced.
      expectSyncedScopes([scopeA], [scopeB], [scopeA], [scopeB]);
    });

    it('invalidating one scope does not affect the other', async () => {
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA, scopeB],
        triggeredBy: undefined,
      });
      expectSyncedScopes([scopeA], [scopeB]);

      // Syncing scopeA is a no-op because it's already cached.
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      expectSyncedScopes([scopeA], [scopeB]);

      // Invalidate scopeA only.
      service.invalidateContractForScopes(contractAddress, [scopeA]);

      // Now syncing scopeA triggers a re-sync.
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      expectSyncedScopes([scopeA], [scopeB], [scopeA]);

      // Syncing both scopes only re-syncs scopeA (already re-synced above is cached), scopeB is still cached.
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA, scopeB],
        triggeredBy: undefined,
      });
      expectSyncedScopes([scopeA], [scopeB], [scopeA]);
    });

    it('empty scopes is a no-op', async () => {
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA, scopeB],
        triggeredBy: undefined,
      });
      expectSyncedScopes([scopeA], [scopeB]);

      service.invalidateContractForScopes(contractAddress, []);

      // Both scopes should still be cached since no scopes were invalidated.
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA, scopeB],
        triggeredBy: undefined,
      });
      expectSyncedScopes([scopeA], [scopeB]);
    });

    it('does not affect other contracts', async () => {
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      await service.ensureContractSynced({
        contract: contract2,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      expectSyncedContracts([contractAddress, [scopeA]], [contract2, [scopeA]]);

      service.invalidateContractForScopes(contractAddress, [scopeA]);

      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      await service.ensureContractSynced({
        contract: contract2,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      expectSyncedContracts([contractAddress, [scopeA]], [contract2, [scopeA]], [contractAddress, [scopeA]]);
    });
  });

  describe('speculative sync', () => {
    const otherContract = AztecAddress.fromBigIntUnsafe(101n);
    // Calls are recorded and predicted per function, so each contract gets its own function with a distinct selector.
    const entryFn: ContractFunction = { address: contractAddress, selector: new FunctionSelector(0xe1) };
    const otherFn: ContractFunction = { address: otherContract, selector: new FunctionSelector(0xe2) };

    beforeEach(() => {
      service = new ContractSyncService(
        aztecNode,
        contractStore,
        contractClassService,
        noteStore,
        createLogger('test:contract-sync'),
        { concurrentContractSyncEnabled: true },
      );
    });

    it('speculatively syncs the whole predicted call tree', async () => {
      const grandChild = AztecAddress.fromBigIntUnsafe(102n);
      const grandChildFn: ContractFunction = { address: grandChild, selector: new FunctionSelector(0xe3) };
      await learnDependencies({
        count: PREDICTION_THRESHOLD,
        calls: [
          { caller: entryFn, callee: otherFn },
          { caller: otherFn, callee: grandChildFn },
        ],
      });

      // A new job requests only contractAddress: its callee syncs, and so does its callee's callee.
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: entryFn.selector,
        utilityExecutor,
        anchorBlockHeader,
        jobId: 'job-3',
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      // The speculative syncs run in the background; yield so they reach the executor.
      await tick();
      expectSyncedContracts([contractAddress, [scopeA]], [otherContract, [scopeA]], [grandChild, [scopeA]]);
    });

    it('speculatively syncs the callees of a function of an already-synced contract', async () => {
      const secondFn: ContractFunction = { address: contractAddress, selector: new FunctionSelector(0xe4) };
      await learnDependencies({
        count: PREDICTION_THRESHOLD,
        calls: [{ caller: secondFn, callee: otherFn }],
      });

      // The first function syncs the contract; invoking a second function afterwards hits the sync cache, but its
      // own predicted callees must still sync.
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: entryFn.selector,
        utilityExecutor,
        anchorBlockHeader,
        jobId: 'job-3',
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: secondFn.selector,
        utilityExecutor,
        anchorBlockHeader,
        jobId: 'job-3',
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      await tick();
      expectSyncedContracts([contractAddress, [scopeA]], [otherContract, [scopeA]]);
    });

    it('speculatively syncs the dependencies of the contract sync itself', async () => {
      // `sync_state` is only ever invoked by PXE, so its callees (e.g. most contract syncs query the handshake
      // registry) are learned and predicted under the universal sync_state selector, not under a requested function.
      const syncStateFn: ContractFunction = { address: contractAddress, selector: SYNC_STATE_SELECTOR };
      await learnDependencies({
        count: PREDICTION_THRESHOLD,
        calls: [{ caller: syncStateFn, callee: otherFn }],
      });

      // A direct read syncs the contract without invoking any function, yet sync_state's learned callee still syncs.
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId: 'job-3',
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      await tick();
      expectSyncedContracts([contractAddress, [scopeA]], [otherContract, [scopeA]]);
    });

    it("speculatively syncs a predicted callee's own sync dependencies", async () => {
      const thirdContract = AztecAddress.fromBigIntUnsafe(102n);
      const thirdFn: ContractFunction = { address: thirdContract, selector: new FunctionSelector(0xe3) };
      const otherSyncState: ContractFunction = { address: otherContract, selector: SYNC_STATE_SELECTOR };
      await learnDependencies({
        count: PREDICTION_THRESHOLD,
        calls: [
          { caller: entryFn, callee: otherFn },
          { caller: otherSyncState, callee: thirdFn },
        ],
      });

      // The entry function predicts otherContract, and starting otherContract's sync predicts its own sync_state's
      // callee, so the whole chain syncs from a single request.
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: entryFn.selector,
        utilityExecutor,
        anchorBlockHeader,
        jobId: 'job-3',
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      await tick();
      expectSyncedContracts([contractAddress, [scopeA]], [otherContract, [scopeA]], [thirdContract, [scopeA]]);
    });

    it('stops recursing when the known calls form a cycle', async () => {
      await learnDependencies({
        count: PREDICTION_THRESHOLD,
        calls: [
          { caller: entryFn, callee: otherFn },
          { caller: otherFn, callee: entryFn },
        ],
      });

      // Each contract syncs exactly once: the job's set of already-speculated functions stops the recursion when the
      // predicted graph loops back to a function it already speculated from.
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: entryFn.selector,
        utilityExecutor,
        anchorBlockHeader,
        jobId: 'job-3',
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      await tick();
      expectSyncedContracts([contractAddress, [scopeA]], [otherContract, [scopeA]]);
    });

    it('stops recursing when predicted sync dependencies form a cycle', async () => {
      const ownSyncState: ContractFunction = { address: contractAddress, selector: SYNC_STATE_SELECTOR };
      const otherSyncState: ContractFunction = { address: otherContract, selector: SYNC_STATE_SELECTOR };
      await learnDependencies({
        count: PREDICTION_THRESHOLD,
        calls: [
          { caller: ownSyncState, callee: otherFn },
          { caller: otherSyncState, callee: entryFn },
        ],
      });

      // Each contract syncs exactly once: when the chain loops back to an already-syncing contract, the warm cache
      // and the job's already-speculated set stop it.
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: null,
        utilityExecutor,
        anchorBlockHeader,
        jobId: 'job-3',
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      await tick();
      expectSyncedContracts([contractAddress, [scopeA]], [otherContract, [scopeA]]);
    });
  });

  describe('settle', () => {
    beforeEach(() => {
      service = new ContractSyncService(
        aztecNode,
        contractStore,
        contractClassService,
        noteStore,
        createLogger('test:contract-sync'),
        { concurrentContractSyncEnabled: true },
      );
    });

    const otherContract = AztecAddress.fromBigIntUnsafe(101n);
    const entryFn: ContractFunction = { address: contractAddress, selector: new FunctionSelector(0xe1) };
    const otherFn: ContractFunction = { address: otherContract, selector: new FunctionSelector(0xe2) };

    it('waits for a speculative sync still in flight', async () => {
      await learnDependencies({
        count: PREDICTION_THRESHOLD,
        calls: [{ caller: entryFn, callee: otherFn }],
      });

      // otherContract's sync_state hangs until released, keeping its speculative sync in flight.
      const { promise: speculativeSync, resolve: releaseSpeculative } = promiseWithResolvers<void>();
      utilityExecutor.mockImplementation(call => {
        if (call.to.equals(otherContract)) {
          return speculativeSync;
        }
        return Promise.resolve();
      });

      // The job only requests contractAddress, so nothing awaits otherContract's speculative sync.
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: entryFn.selector,
        utilityExecutor,
        anchorBlockHeader,
        jobId: 'job-3',
        scopes: [scopeA],
        triggeredBy: undefined,
      });

      let settled = false;
      const settlePromise = service.settle('job-3').then(() => {
        settled = true;
      });
      await tick();
      expect(settled).toBe(false);

      releaseSpeculative();
      await settlePromise;
    });

    it('waits for speculative syncs fired while settling', async () => {
      const lateContract = AztecAddress.fromBigIntUnsafe(102n);
      const lateFn: ContractFunction = { address: lateContract, selector: new FunctionSelector(0xe3) };
      const thirdContract = AztecAddress.fromBigIntUnsafe(103n);
      const thirdFn: ContractFunction = { address: thirdContract, selector: new FunctionSelector(0xe4) };
      await learnDependencies({
        count: PREDICTION_THRESHOLD,
        calls: [
          { caller: entryFn, callee: otherFn },
          { caller: lateFn, callee: thirdFn },
        ],
      });

      // otherContract's speculative sync is held until the job is already settling. When released, its sync_state
      // makes a nested call to lateContract, whose predicted callee (thirdContract) fires a fresh speculative sync
      // mid-drain, hanging until released.
      const { promise: otherGate, resolve: releaseOther } = promiseWithResolvers<void>();
      const { promise: thirdSync, resolve: releaseThird } = promiseWithResolvers<void>();
      utilityExecutor.mockImplementation(async call => {
        if (call.to.equals(otherContract)) {
          await otherGate;
          await service.ensureContractSynced({
            contract: lateContract,
            functionToInvokeAfterSync: lateFn.selector,
            utilityExecutor,
            anchorBlockHeader,
            jobId: 'job-3',
            scopes: [scopeA],
            triggeredBy: otherFn,
          });
          return;
        }
        return call.to.equals(thirdContract) ? thirdSync : Promise.resolve();
      });

      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: entryFn.selector,
        utilityExecutor,
        anchorBlockHeader,
        jobId: 'job-3',
        scopes: [scopeA],
        triggeredBy: undefined,
      });

      let settled = false;
      const settlePromise = service.settle('job-3').then(() => {
        settled = true;
      });
      releaseOther();
      await tick();
      expect(settled).toBe(false);

      releaseThird();
      await settlePromise;
    });

    it('resolves immediately when the job started no syncs', async () => {
      await expect(service.settle('unknown-job')).resolves.toBeUndefined();
    });

    it('rejects when a speculative sync failed, even though no request observed the failure', async () => {
      await learnDependencies({
        count: PREDICTION_THRESHOLD,
        calls: [{ caller: entryFn, callee: otherFn }],
      });

      utilityExecutor.mockImplementation(call =>
        call.to.equals(otherContract) ? Promise.reject(new Error('speculative boom')) : Promise.resolve(),
      );

      // The job only requests contractAddress, so the failed speculative sync of otherContract rejects no request.
      await service.ensureContractSynced({
        contract: contractAddress,
        functionToInvokeAfterSync: entryFn.selector,
        utilityExecutor,
        anchorBlockHeader,
        jobId: 'job-3',
        scopes: [scopeA],
        triggeredBy: undefined,
      });
      await tick();

      const settleError = await service.settle('job-3').then(
        () => undefined,
        (err: AggregateError) => err,
      );
      expect(settleError).toBeInstanceOf(AggregateError);
      expect(settleError!.message).toContain('Speculative syncs failed');
      expect(settleError!.errors.map((err: Error) => err.message)).toEqual(['speculative boom']);
    });
  });

  /**
   * Runs `count` committed jobs, each using the first caller as the entry and observing the given direct calls, then
   * wipes the sync cache (as an anchor block change would) so the next job's syncs run for real.
   */
  const learnDependencies = async ({ count, calls }: { count: number; calls: Call[] }) => {
    const sync = (id: string, { address, selector }: ContractFunction, triggeredBy: ContractFunction | undefined) =>
      service.ensureContractSynced({
        contract: address,
        functionToInvokeAfterSync: selector,
        utilityExecutor,
        anchorBlockHeader,
        jobId: id,
        scopes: [scopeA],
        triggeredBy,
      });
    for (let i = 0; i < count; i++) {
      const id = `learn-job-${i}`;
      await sync(id, calls[0].caller, undefined);
      for (const { caller, callee } of calls) {
        await sync(id, callee, caller);
      }
      await service.commit(id);
    }
    service.wipe();
    utilityExecutor.mockClear();
  };

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

describe('SYNC_STATE_SELECTOR', () => {
  // Pins the hardcoded selector to the macro's actual output: if the macro ever changes `sync_state`'s signature,
  // this fails instead of predictions silently keying on a stale selector.
  it('matches the selector of a compiled artifact', async () => {
    const syncState = TestContractArtifact.functions.find(f => f.name === 'sync_state');
    expect(syncState).toBeDefined();
    const expected = await FunctionSelector.fromNameAndParameters(syncState!.name, syncState!.parameters);
    expect(SYNC_STATE_SELECTOR).toEqual(expected);
  });
});

/** A direct call observed by a job. */
type Call = { caller: ContractFunction; callee: ContractFunction };
