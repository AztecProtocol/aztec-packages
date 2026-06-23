import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { assertAllowedScope } from '../allowed_scopes.js';
import type { FactCollection, FactStore } from './fact_store.js';
import type { FactCollectionKey, FactCollectionTypeKey, OriginBlock } from './fact_store_keys.js';

/**
 * Wraps a {@link FactStore} with scope-based access control.
 *
 * Each method asserts scope validity before delegating to FactStore, gating which accounts a contract may record facts
 * under or read facts from.
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
    jobId: string,
  ): Promise<void> {
    assertAllowedScope(factCollectionKey.scope, this.allowedScopes);
    return this.factStore.recordFact(factCollectionKey, factTypeId, payload, originBlock, jobId);
  }

  deleteFactCollection(factCollectionKey: FactCollectionKey, jobId: string): Promise<void> {
    assertAllowedScope(factCollectionKey.scope, this.allowedScopes);
    return this.factStore.deleteFactCollection(factCollectionKey, jobId);
  }

  getFactCollection(factCollectionKey: FactCollectionKey, jobId: string): Promise<FactCollection | undefined> {
    assertAllowedScope(factCollectionKey.scope, this.allowedScopes);
    return this.factStore.getFactCollection(factCollectionKey, jobId);
  }

  getFactCollectionsByType(factCollectionTypeKey: FactCollectionTypeKey, jobId: string): Promise<FactCollection[]> {
    assertAllowedScope(factCollectionTypeKey.scope, this.allowedScopes);
    return this.factStore.getFactCollectionsByType(factCollectionTypeKey, jobId);
  }
}
