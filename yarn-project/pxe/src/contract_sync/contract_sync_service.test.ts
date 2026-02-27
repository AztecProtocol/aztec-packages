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

  /** Sentinel for undefined scopes (sync all accounts). */
  const ALL_SCOPES = 'ALL_SCOPES' as const;

  beforeEach(() => {
    utilityExecutor = jest
      .fn<(call: FunctionCall, scopes: AccessScopes) => Promise<void>>()
      .mockResolvedValue(undefined);

    contractStore = mock<ContractStore>();
    contractStore.getFunctionCall.mockResolvedValue(
      FunctionCall.from({
        name: 'sync_state',
        to: contractAddress,
        selector: FunctionSelector.empty(),
        type: FunctionType.UTILITY,
        hideMsgSender: false,
        isStatic: false,
        args: [],
        returnTypes: [],
      }),
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
      await service.ensureContractSynced(
        contractAddress,
        null,
        utilityExecutor,
        anchorBlockHeader,
        jobId,
        'ALL_SCOPES',
      );
      expectSyncedScopes(ALL_SCOPES);

      // After syncing all scopes, scope-specific calls should be skipped
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeB]);
      expectSyncedScopes(ALL_SCOPES);
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
      expectSyncedScopes([scopeA], ALL_SCOPES);
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

    it('skips sync for overridden contract in the same job', async () => {
      service.setOverriddenContracts(jobId, new Set([contractAddress.toString()]));
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      expectNoSync();
    });

    it('does not skip sync for overridden contract in a different job', async () => {
      service.setOverriddenContracts('other-job', new Set([contractAddress.toString()]));
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
    it('clears overrides for the given job', async () => {
      service.setOverriddenContracts(jobId, new Set([contractAddress.toString()]));
      await service.commit(jobId);

      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      // When overrides are set, contract sync is skipped. We verify the overrides were cleared by confirming that sync
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

    it('clears overrides for the given job', async () => {
      service.setOverriddenContracts(jobId, new Set([contractAddress.toString()]));
      await service.discardStaged(jobId);

      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      // When overrides are set, contract sync is skipped. We verify the overrides were cleared by confirming that sync
      // was actually triggered.
      expectSyncedScopes([scopeA]);
    });

    it('preserves overrides for other jobs', async () => {
      service.setOverriddenContracts(jobId, new Set([contractAddress.toString()]));
      service.setOverriddenContracts('other-job', new Set([contractAddress.toString()]));
      await service.discardStaged(jobId);

      // jobId override cleared, sync proceeds
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, jobId, [scopeA]);
      expectSyncedScopes([scopeA]);

      // other-job override still active, sync skipped
      await service.ensureContractSynced(contractAddress, null, utilityExecutor, anchorBlockHeader, 'other-job', [
        scopeA,
      ]);
      expectSyncedScopes([scopeA]);
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

  const expectNoSync = () => expect(utilityExecutor).not.toHaveBeenCalled();
});
