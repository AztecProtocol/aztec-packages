import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { CapsuleService } from './capsule_service.js';
import { CapsuleStore } from './capsule_store.js';

describe('CapsuleService', () => {
  let contract: AztecAddress;
  let allowedScope: AztecAddress;
  let disallowedScope: AztecAddress;
  let capsuleStore: CapsuleStore;
  let capsuleService: CapsuleService;

  const jobId = 'test';

  beforeEach(async () => {
    contract = await AztecAddress.random();
    allowedScope = await AztecAddress.random();
    disallowedScope = await AztecAddress.random();
    capsuleStore = new CapsuleStore(await openTmpStore('capsule_service_test'));
    capsuleService = new CapsuleService(capsuleStore, [allowedScope]);
  });

  describe('scope enforcement', () => {
    const slot = new Fr(1);
    const capsule = [new Fr(42)];

    it('setCapsule rejects a disallowed scope', () => {
      expect(() => capsuleService.setCapsule(contract, slot, capsule, jobId, disallowedScope)).toThrow(
        'is not in the allowed scopes list',
      );
    });

    it('getCapsule rejects a disallowed scope', async () => {
      await expect(capsuleService.getCapsule(contract, slot, jobId, disallowedScope)).rejects.toThrow(
        'is not in the allowed scopes list',
      );
    });

    it('deleteCapsule rejects a disallowed scope', () => {
      expect(() => capsuleService.deleteCapsule(contract, slot, jobId, disallowedScope)).toThrow(
        'is not in the allowed scopes list',
      );
    });

    it('copyCapsule rejects a disallowed scope', () => {
      expect(() => capsuleService.copyCapsule(contract, slot, new Fr(5), 1, jobId, disallowedScope)).toThrow(
        'is not in the allowed scopes list',
      );
    });

    it('appendToCapsuleArray rejects a disallowed scope', () => {
      expect(() => capsuleService.appendToCapsuleArray(contract, slot, [capsule], jobId, disallowedScope)).toThrow(
        'is not in the allowed scopes list',
      );
    });

    it('readCapsuleArray rejects a disallowed scope', () => {
      expect(() => capsuleService.readCapsuleArray(contract, slot, jobId, disallowedScope)).toThrow(
        'is not in the allowed scopes list',
      );
    });

    it('setCapsuleArray rejects a disallowed scope', () => {
      expect(() => capsuleService.setCapsuleArray(contract, slot, [capsule], jobId, disallowedScope)).toThrow(
        'is not in the allowed scopes list',
      );
    });

    it('allows operations with an allowed scope', async () => {
      const scope = allowedScope;

      // setCapsule + getCapsule
      capsuleService.setCapsule(contract, slot, capsule, jobId, scope);
      expect(await capsuleService.getCapsule(contract, slot, jobId, scope)).toEqual(capsule);

      // deleteCapsule
      capsuleService.deleteCapsule(contract, slot, jobId, scope);
      expect(await capsuleService.getCapsule(contract, slot, jobId, scope)).toBeNull();

      // copyCapsule
      capsuleService.setCapsule(contract, slot, capsule, jobId, scope);
      await capsuleService.copyCapsule(contract, slot, new Fr(5), 1, jobId, scope);
      expect(await capsuleService.getCapsule(contract, new Fr(5), jobId, scope)).toEqual(capsule);

      // appendToCapsuleArray + readCapsuleArray
      const baseSlot = new Fr(10);
      await capsuleService.appendToCapsuleArray(contract, baseSlot, [capsule], jobId, scope);
      expect(await capsuleService.readCapsuleArray(contract, baseSlot, jobId, scope)).toEqual([capsule]);

      // setCapsuleArray
      const newArray = [capsule, capsule];
      await capsuleService.setCapsuleArray(contract, baseSlot, newArray, jobId, scope);
      expect(await capsuleService.readCapsuleArray(contract, baseSlot, jobId, scope)).toEqual(newArray);
    });

    it('address zero is always allowed even if not in the scopes list', async () => {
      const scope = AztecAddress.ZERO;

      // setCapsule + getCapsule
      capsuleService.setCapsule(contract, slot, capsule, jobId, scope);
      expect(await capsuleService.getCapsule(contract, slot, jobId, scope)).toEqual(capsule);

      // deleteCapsule
      capsuleService.deleteCapsule(contract, slot, jobId, scope);
      expect(await capsuleService.getCapsule(contract, slot, jobId, scope)).toBeNull();

      // copyCapsule
      capsuleService.setCapsule(contract, slot, capsule, jobId, scope);
      await capsuleService.copyCapsule(contract, slot, new Fr(5), 1, jobId, scope);
      expect(await capsuleService.getCapsule(contract, new Fr(5), jobId, scope)).toEqual(capsule);

      // appendToCapsuleArray + readCapsuleArray
      const baseSlot = new Fr(10);
      await capsuleService.appendToCapsuleArray(contract, baseSlot, [capsule], jobId, scope);
      expect(await capsuleService.readCapsuleArray(contract, baseSlot, jobId, scope)).toEqual([capsule]);

      // setCapsuleArray
      const newArray = [capsule, capsule];
      await capsuleService.setCapsuleArray(contract, baseSlot, newArray, jobId, scope);
      expect(await capsuleService.readCapsuleArray(contract, baseSlot, jobId, scope)).toEqual(newArray);
    });

    it('empty allowed scopes rejects requests', async () => {
      const noScopesService = new CapsuleService(capsuleStore, []);
      const scope = allowedScope;
      const err = 'is not in the allowed scopes list';

      expect(() => noScopesService.setCapsule(contract, slot, capsule, jobId, scope)).toThrow(err);
      await expect(noScopesService.getCapsule(contract, slot, jobId, scope)).rejects.toThrow(err);
      expect(() => noScopesService.deleteCapsule(contract, slot, jobId, scope)).toThrow(err);
      expect(() => noScopesService.copyCapsule(contract, slot, new Fr(5), 1, jobId, scope)).toThrow(err);
      expect(() => noScopesService.appendToCapsuleArray(contract, slot, [capsule], jobId, scope)).toThrow(err);
      expect(() => noScopesService.readCapsuleArray(contract, slot, jobId, scope)).toThrow(err);
      expect(() => noScopesService.setCapsuleArray(contract, slot, [capsule], jobId, scope)).toThrow(err);
    });
  });
});
