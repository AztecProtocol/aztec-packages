import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { assertAllowedScope } from '../allowed_scopes.js';
import type { FactCollection, FactStore } from './fact_store.js';
import type { FactCollectionKey, FactCollectionTypeKey, OriginBlock } from './fact_store_keys.js';

/**
 * Wraps a {@link FactStore} with scope-based access control.
 *
 * Writes assert the single scope they act under is allowed; reads assert every scope they filter by is allowed. The
 * scope checks gate which accounts a contract may record facts under or read facts from, the same way the
 * `CapsuleService` gates capsule access.
 */
export class FactService {
  constructor(
    private readonly factStore: FactStore,
    private readonly allowedScopes: AztecAddress[],
  ) {}

  recordFact(
    factCollectionKey: FactCollectionKey,
    factTypeId: Fr,
    payload: Fr[],
    originBlock: OriginBlock | undefined,
    scope: AztecAddress,
    jobId: string,
  ): Promise<void> {
    assertAllowedScope(scope, this.allowedScopes);
    return this.factStore.recordFact(factCollectionKey, factTypeId, payload, originBlock, scope, jobId);
  }

  removeFactCollection(factCollectionKey: FactCollectionKey, scope: AztecAddress, jobId: string): Promise<void> {
    assertAllowedScope(scope, this.allowedScopes);
    return this.factStore.removeFactCollection(factCollectionKey, scope, jobId);
  }

  getFactCollection(
    factCollectionKey: FactCollectionKey,
    scopes: AztecAddress[],
    jobId: string,
  ): Promise<FactCollection | undefined> {
    scopes.forEach(scope => assertAllowedScope(scope, this.allowedScopes));
    return this.factStore.getFactCollection(factCollectionKey, scopes, jobId);
  }

  getFactCollectionsByType(
    factCollectionTypeKey: FactCollectionTypeKey,
    scopes: AztecAddress[],
    jobId: string,
  ): Promise<FactCollection[]> {
    scopes.forEach(scope => assertAllowedScope(scope, this.allowedScopes));
    return this.factStore.getFactCollectionsByType(factCollectionTypeKey, scopes, jobId);
  }
}
