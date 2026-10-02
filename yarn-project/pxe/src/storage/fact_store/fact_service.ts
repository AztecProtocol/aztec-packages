import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { assertAllowedScope } from '../allowed_scopes.js';
import type { ChangeSetId } from '../staged_write_coordinator.js';
import type { FactScope } from './fact_scope.js';
import type { FactStore } from './fact_store.js';
import type { BlockReference, FactCollectionKey, FactCollectionTypeKey } from './fact_store_keys.js';
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
 * under or read facts from. The public scope belongs to no account, so it is always allowed.
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
    originBlock: BlockReference | undefined,
    changeSetId: ChangeSetId,
  ): Promise<void> {
    this.#assertAllowedFactScope(factCollectionKey.scope);
    return this.factStore.recordFact(factCollectionKey, factTypeId, payload, originBlock, changeSetId);
  }

  deleteFactCollection(factCollectionKey: FactCollectionKey, changeSetId: ChangeSetId): Promise<void> {
    this.#assertAllowedFactScope(factCollectionKey.scope);
    return this.factStore.deleteFactCollection(factCollectionKey, changeSetId);
  }

  async getFactCollection(
    factCollectionKey: FactCollectionKey,
    tips: TipBlockNumbers,
    changeSetId: ChangeSetId,
  ): Promise<FactCollectionWithOriginState | undefined> {
    this.#assertAllowedFactScope(factCollectionKey.scope);
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
    this.#assertAllowedFactScope(factCollectionTypeKey.scope);
    const collections = await this.factStore.getFactCollectionsByType(factCollectionTypeKey, changeSetId);
    return collections.map(collection => ({ key: collection.key, facts: this.#annotate(collection.facts, tips) }));
  }

  #assertAllowedFactScope(scope: FactScope): void {
    switch (scope.type) {
      case 'account':
        assertAllowedScope(scope.account, this.allowedScopes);
        break;
      case 'public':
        break;
      default: {
        const _exhaustive: never = scope;
        throw new Error(`Unhandled fact scope type: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  #annotate(facts: Fact[], tips: TipBlockNumbers): FactWithOriginState[] {
    return facts.map(fact => toFactWithOriginState(fact, tips));
  }
}
