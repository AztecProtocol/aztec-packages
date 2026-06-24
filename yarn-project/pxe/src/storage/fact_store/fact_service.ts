import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2Tips } from '@aztec/stdlib/block';

import { assertAllowedScope } from '../allowed_scopes.js';
import type { FactStore } from './fact_store.js';
import type { FactCollectionKey, FactCollectionTypeKey, OriginBlock } from './fact_store_keys.js';
import {
  type AnnotatedFact,
  type AnnotatedFactCollection,
  type TipBlockNumbers,
  annotateFact,
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
    jobId: string,
  ): Promise<void> {
    assertAllowedScope(factCollectionKey.scope, this.allowedScopes);
    return this.factStore.recordFact(factCollectionKey, factTypeId, payload, originBlock, jobId);
  }

  deleteFactCollection(factCollectionKey: FactCollectionKey, jobId: string): Promise<void> {
    assertAllowedScope(factCollectionKey.scope, this.allowedScopes);
    return this.factStore.deleteFactCollection(factCollectionKey, jobId);
  }

  async getFactCollection(
    factCollectionKey: FactCollectionKey,
    tips: L2Tips,
    jobId: string,
  ): Promise<AnnotatedFactCollection | undefined> {
    assertAllowedScope(factCollectionKey.scope, this.allowedScopes);
    const collection = await this.factStore.getFactCollection(factCollectionKey, jobId);
    if (!collection) {
      return undefined;
    }
    return { key: collection.key, facts: this.#annotate(collection.facts, tips) };
  }

  async getFactCollectionsByType(
    factCollectionTypeKey: FactCollectionTypeKey,
    tips: L2Tips,
    jobId: string,
  ): Promise<AnnotatedFactCollection[]> {
    assertAllowedScope(factCollectionTypeKey.scope, this.allowedScopes);
    const collections = await this.factStore.getFactCollectionsByType(factCollectionTypeKey, jobId);
    return collections.map(collection => ({ key: collection.key, facts: this.#annotate(collection.facts, tips) }));
  }

  #annotate(facts: Fact[], tips: L2Tips): AnnotatedFact[] {
    const tipBlockNumbers: TipBlockNumbers = {
      provenBlockNumber: tips.proven.block.number,
      finalizedBlockNumber: tips.finalized.block.number,
    };
    return facts.map(fact => annotateFact(fact, tipBlockNumbers));
  }
}
