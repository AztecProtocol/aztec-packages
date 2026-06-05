import type { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { Capsule } from '@aztec/stdlib/tx';

import type { CapsuleStore } from './capsule_store.js';

/**
 * Wraps a CapsuleStore with scope-based access control. Each operation asserts that the requested scope is in the
 * allowed scopes list before delegating to the underlying store.
 */
export class CapsuleService {
  constructor(
    private readonly capsuleStore: CapsuleStore,
    private readonly allowedScopes: AztecAddress[],
  ) {}

  setCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[], jobId: string, scope: AztecAddress) {
    assertAllowedScope(scope, this.allowedScopes);
    this.capsuleStore.setCapsule(contractAddress, slot, capsule, jobId, scope);
  }

  async getCapsule(
    contractAddress: AztecAddress,
    slot: Fr,
    jobId: string,
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

    return maybeTransientCapsule ?? (await this.capsuleStore.getCapsule(contractAddress, slot, jobId, scope));
  }

  deleteCapsule(contractAddress: AztecAddress, slot: Fr, jobId: string, scope: AztecAddress) {
    assertAllowedScope(scope, this.allowedScopes);
    this.capsuleStore.deleteCapsule(contractAddress, slot, jobId, scope);
  }

  copyCapsule(
    contractAddress: AztecAddress,
    srcSlot: Fr,
    dstSlot: Fr,
    numEntries: number,
    jobId: string,
    scope: AztecAddress,
  ): Promise<void> {
    assertAllowedScope(scope, this.allowedScopes);
    return this.capsuleStore.copyCapsule(contractAddress, srcSlot, dstSlot, numEntries, jobId, scope);
  }

  appendToCapsuleArray(
    contractAddress: AztecAddress,
    baseSlot: Fr,
    content: Fr[][],
    jobId: string,
    scope: AztecAddress,
  ): Promise<void> {
    assertAllowedScope(scope, this.allowedScopes);
    return this.capsuleStore.appendToCapsuleArray(contractAddress, baseSlot, content, jobId, scope);
  }

  readCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, jobId: string, scope: AztecAddress): Promise<Fr[][]> {
    assertAllowedScope(scope, this.allowedScopes);
    return this.capsuleStore.readCapsuleArray(contractAddress, baseSlot, jobId, scope);
  }

  setCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, content: Fr[][], jobId: string, scope: AztecAddress) {
    assertAllowedScope(scope, this.allowedScopes);
    return this.capsuleStore.setCapsuleArray(contractAddress, baseSlot, content, jobId, scope);
  }
}

/**
 * Asserts that `scope` is permitted given `allowedScopes`. The zero scope is always allowed (it denotes the
 * unscoped/global namespace). Throws otherwise.
 */
export function assertAllowedScope(scope: AztecAddress, allowedScopes: AztecAddress[]) {
  if (scope.equals(AztecAddress.ZERO)) {
    return;
  }
  if (!allowedScopes.some((allowed: AztecAddress) => allowed.equals(scope))) {
    throw new Error(
      `Scope ${scope.toString()} is not in the allowed scopes list: [${allowedScopes.map((s: AztecAddress) => s.toString()).join(', ')}]. See https://docs.aztec.network/errors/10`,
    );
  }
}
