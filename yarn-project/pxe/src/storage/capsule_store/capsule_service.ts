import type { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { Capsule } from '@aztec/stdlib/tx';

import { assertAllowedScope } from '../allowed_scopes.js';
import type { ChangeSetId } from '../staged_write_coordinator.js';
import type { CapsuleStore } from './capsule_store.js';

/**
 * Wraps a CapsuleStore with scope-based access control. Each operation asserts that the requested scope is in the
 * allowed scopes list before delegating to the underlying store.
 */
export class CapsuleService {
  private readonly allowedScopes: AztecAddress[];

  constructor(
    private readonly capsuleStore: CapsuleStore,
    allowedScopes: AztecAddress[],
  ) {
    // The zero address denotes the global capsule scope, which is always permitted.
    this.allowedScopes = [...allowedScopes, AztecAddress.ZERO];
  }

  setCapsule(
    contractAddress: AztecAddress,
    slot: Fr,
    capsule: Fr[],
    changeSetId: ChangeSetId,
    scope: AztecAddress,
  ): Promise<void> {
    assertAllowedScope(scope, this.allowedScopes);
    return this.capsuleStore.setCapsule(contractAddress, slot, capsule, changeSetId, scope);
  }

  async getCapsule(
    contractAddress: AztecAddress,
    slot: Fr,
    changeSetId: ChangeSetId,
    scope: AztecAddress,
    transientCapsules?: Capsule[],
  ): Promise<Fr[] | null> {
    assertAllowedScope(scope, this.allowedScopes);

    // TODO(#12425): On the following line, the pertinent capsule gets overshadowed by the transient one. Tackle this.
    const maybeTransientCapsule = transientCapsules?.find(
      c =>
        c.contractAddress.equals(contractAddress) &&
        c.storageSlot.equals(slot) &&
        (c.scope ?? AztecAddress.ZERO).equals(scope),
    )?.data;

    return maybeTransientCapsule ?? (await this.capsuleStore.getCapsule(contractAddress, slot, changeSetId, scope));
  }

  deleteCapsule(contractAddress: AztecAddress, slot: Fr, changeSetId: ChangeSetId, scope: AztecAddress): Promise<void> {
    assertAllowedScope(scope, this.allowedScopes);
    return this.capsuleStore.deleteCapsule(contractAddress, slot, changeSetId, scope);
  }

  copyCapsule(
    contractAddress: AztecAddress,
    srcSlot: Fr,
    dstSlot: Fr,
    numEntries: number,
    changeSetId: ChangeSetId,
    scope: AztecAddress,
  ): Promise<void> {
    assertAllowedScope(scope, this.allowedScopes);
    return this.capsuleStore.copyCapsule(contractAddress, srcSlot, dstSlot, numEntries, changeSetId, scope);
  }

  appendToCapsuleArray(
    contractAddress: AztecAddress,
    baseSlot: Fr,
    content: Fr[][],
    changeSetId: ChangeSetId,
    scope: AztecAddress,
  ): Promise<void> {
    assertAllowedScope(scope, this.allowedScopes);
    return this.capsuleStore.appendToCapsuleArray(contractAddress, baseSlot, content, changeSetId, scope);
  }

  readCapsuleArray(
    contractAddress: AztecAddress,
    baseSlot: Fr,
    changeSetId: ChangeSetId,
    scope: AztecAddress,
  ): Promise<Fr[][]> {
    assertAllowedScope(scope, this.allowedScopes);
    return this.capsuleStore.readCapsuleArray(contractAddress, baseSlot, changeSetId, scope);
  }

  setCapsuleArray(
    contractAddress: AztecAddress,
    baseSlot: Fr,
    content: Fr[][],
    changeSetId: ChangeSetId,
    scope: AztecAddress,
  ) {
    assertAllowedScope(scope, this.allowedScopes);
    return this.capsuleStore.setCapsuleArray(contractAddress, baseSlot, content, changeSetId, scope);
  }
}
