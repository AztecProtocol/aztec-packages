import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { FunctionCall, FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { makeBlockHeader } from '@aztec/stdlib/testing';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import type { AccessScopes } from '../access_scopes.js';
import type { ContractStore } from '../storage/contract_store/contract_store.js';
import type { NoteStore } from '../storage/note_store/note_store.js';
import { ContractSyncService } from './contract_sync_service.js';

describe('ContractSyncService', () => {
  let aztecNode: ReturnType<typeof mock<AztecNode>>;
  let contractStore: ReturnType<typeof mock<ContractStore>>;
  let noteStore: ReturnType<typeof mock<NoteStore>>;
  let service: ContractSyncService;
  let utilityExecutor: jest.Mock<(call: FunctionCall, scopes: AccessScopes) => Promise<void>>;

  const contractAddress = AztecAddress.fromBigInt(100n);
  const scopeA = AztecAddress.fromBigInt(200n);
  const scopeB = AztecAddress.fromBigInt(201n);
  const jobId = 'job-1';
  const anchorBlockHeader = makeBlockHeader(0);
  const classId = Fr.fromHexString('0xdeadbeef');

  beforeEach(() => {
    utilityExecutor = jest
      .fn<(call: FunctionCall, scopes: AccessScopes) => Promise<void>>()
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
    // readCurrentClassId reads from public storage; Fr.ZERO causes fallback to originalContractClassId
    aztecNode.getPublicStorageAt.mockResolvedValue(Fr.ZERO);

    noteStore = mock<NoteStore>();
    // syncNoteNullifiers returns early when no notes
    noteStore.getNotes.mockResolvedValue([]);

    service = new ContractSyncService(
      aztecNode,
      contractStore,
      noteStore,
      () => Promise.resolve([scopeA, scopeB]),
      createLogger('test:contract-sync'),
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
      await service.ensureContractSynced(
        contractAddress,
        null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        'ALL_SCOPES',
      );
      // ALL_SCOPES resolves to [scopeA, scopeB] via getRegisteredAccounts, so syncState is called once per account
      expectSyncedScopes([scopeA], [scopeB]);

      // After syncing all scopes, scope-specific calls should be skipped
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeB]);
      expectSyncedScopes([scopeA], [scopeB]);
    });

    it('still syncs all scopes even after scope-specific sync', async () => {
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      await service.ensureContractSynced(
        contractAddress,
        null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        'ALL_SCOPES',
      );
      // ALL_SCOPES resolves to [scopeA, scopeB]; both are re-synced since ALL_SCOPES bypasses per-scope cache
      expectSyncedScopes([scopeA], [scopeA], [scopeB]);
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

    it('skips sync for excluded contract in the same job', async () => {
      service.setExcludedFromSync(jobId, new Set([contractAddress.toString()]));
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      expectNoSync();
    });

    it('does not skip sync for excluded contract in a different job', async () => {
      service.setExcludedFromSync('other-job', new Set([contractAddress.toString()]));
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      expectSyncedScopes([scopeA]);
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
    it('clears exclusions for the given job', async () => {
      service.setExcludedFromSync(jobId, new Set([contractAddress.toString()]));
      await service.commit(jobId);

      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      // When exclusions are set, contract sync is skipped. We verify the exclusions were cleared by confirming that sync
      // was actually triggered.
      expectSyncedScopes([scopeA]);
    });

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

    it('clears exclusions for the given job', async () => {
      service.setExcludedFromSync(jobId, new Set([contractAddress.toString()]));
      await service.discardStaged(jobId);

      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      // When exclusions are set, contract sync is skipped. We verify the exclusions were cleared by confirming that sync
      // was actually triggered.
      expectSyncedScopes([scopeA]);
    });

    it('preserves exclusions for other jobs', async () => {
      service.setExcludedFromSync(jobId, new Set([contractAddress.toString()]));
      service.setExcludedFromSync('other-job', new Set([contractAddress.toString()]));
      await service.discardStaged(jobId);

      // jobId exclusion cleared, sync proceeds
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      expectSyncedScopes([scopeA]);

      // other-job exclusion still active, sync skipped
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, 'other-job', [
        scopeA,
      ]);
      expectSyncedScopes([scopeA]);
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

    it('also invalidates the ALL_SCOPES entry', async () => {
      // Sync ALL_SCOPES -- covers every account. Resolves to [scopeA, scopeB] via getRegisteredAccounts.
      await service.ensureContractSynced(
        contractAddress,
        null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        'ALL_SCOPES',
      );
      expectSyncedScopes([scopeA], [scopeB]);

      // Syncing scopeA is a no-op because ALL_SCOPES already covers it.
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      expectSyncedScopes([scopeA], [scopeB]);

      // Invalidate scopeA -- this should also clear the ALL_SCOPES entry.
      service.invalidateContractForScopes(contractAddress, [scopeA]);

      // Now syncing scopeA triggers a re-sync.
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      expectSyncedScopes([scopeA], [scopeB], [scopeA]);

      // And syncing ALL_SCOPES also triggers a re-sync since it was invalidated too.
      await service.ensureContractSynced(
        contractAddress,
        null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        'ALL_SCOPES',
      );
      expectSyncedScopes([scopeA], [scopeB], [scopeA], [scopeA], [scopeB]);
    });

    it('empty scopes is a no-op', async () => {
      await service.ensureContractSynced(
        contractAddress,
        null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        'ALL_SCOPES',
      );
      expectSyncedScopes([scopeA], [scopeB]);

      service.invalidateContractForScopes(contractAddress, []);

      // ALL_SCOPES should still be cached since no scopes were invalidated.
      await service.ensureContractSynced(
        contractAddress,
        null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        'ALL_SCOPES',
      );
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
  const expectSyncedScopes = (...expectedScopes: AccessScopes[]) => {
    expect(utilityExecutor).toHaveBeenCalledTimes(expectedScopes.length);
    for (let i = 0; i < expectedScopes.length; i++) {
      const [, actualScopes] = utilityExecutor.mock.calls[i];
      expect(actualScopes).toEqual(expectedScopes[i]);
    }
  };

  /** Asserts the utility executor was called exactly with the given sequence of [contractAddress, scopes] pairs. */
  const expectSyncedContracts = (...expected: [AztecAddress, AccessScopes][]) => {
    expect(utilityExecutor).toHaveBeenCalledTimes(expected.length);
    for (let i = 0; i < expected.length; i++) {
      const [call, actualScopes] = utilityExecutor.mock.calls[i];
      expect(call.to).toEqual(expected[i][0]);
      expect(actualScopes).toEqual(expected[i][1]);
    }
  };

  const expectNoSync = () => expect(utilityExecutor).not.toHaveBeenCalled();
});
