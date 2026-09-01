import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { assertAllowedScope } from '../allowed_scopes.js';
import type { ChangeSetId } from '../staged_write_coordinator.js';
import type { FactStore } from './fact_store.js';
import type { FactCollectionKey, FactCollectionTypeKey, OriginBlock } from './fact_store_keys.js';
import {
  type FactCollectionWithOriginState,
  type FactWithOriginState,
  type TipBlockNumbers,
  toFactWithOriginState,
} from './origin_state.js';
import type { Fact } from './stored_fact.js';

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
    changeSetId: ChangeSetId,
  ): Promise<void> {
    assertAllowedScope(factCollectionKey.scope, this.allowedScopes);
    return this.factStore.recordFact(factCollectionKey, factTypeId, payload, originBlock, changeSetId);
  }

  deleteFactCollection(factCollectionKey: FactCollectionKey, changeSetId: ChangeSetId): Promise<void> {
    assertAllowedScope(factCollectionKey.scope, this.allowedScopes);
    return this.factStore.deleteFactCollection(factCollectionKey, changeSetId);
  }

  async getFactCollection(
    factCollectionKey: FactCollectionKey,
    tips: TipBlockNumbers,
    changeSetId: ChangeSetId,
  ): Promise<FactCollectionWithOriginState | undefined> {
    assertAllowedScope(factCollectionKey.scope, this.allowedScopes);
    const collection = await this.factStore.getFactCollection(factCollectionKey, changeSetId);
    if (!collection) {
      return undefined;
    }
    return { key: collection.key, facts: this.#annotate(collection.facts, tips) };
  }

  async getFactCollectionsByType(
    factCollectionTypeKey: FactCollectionTypeKey,
    tips: TipBlockNumbers,
    changeSetId: ChangeSetId,
  ): Promise<FactCollectionWithOriginState[]> {
    assertAllowedScope(factCollectionTypeKey.scope, this.allowedScopes);
    const collections = await this.factStore.getFactCollectionsByType(factCollectionTypeKey, changeSetId);
    return collections.map(collection => ({ key: collection.key, facts: this.#annotate(collection.facts, tips) }));
  }

  #annotate(facts: Fact[], tips: TipBlockNumbers): FactWithOriginState[] {
    return facts.map(fact => toFactWithOriginState(fact, tips));
  }
}
