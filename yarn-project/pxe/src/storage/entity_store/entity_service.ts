import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { assertAllowedScope } from '../allowed_scopes.js';
import type { Entity, EntityStore } from './entity_store.js';
import type { EntityKey, EntityTypeKey, OriginBlock } from './entity_store_keys.js';

/**
 * Wraps an {@link EntityStore} with scope-based access control. Each operation asserts the scope embedded in the entity
 * key (or entity-type key) is in the allowed scopes list before delegating to the store, mirroring the role
 * `CapsuleService` plays for `CapsuleStore`. Per-contract isolation is enforced by the oracle handler.
 */
export class EntityService {
  constructor(
    private readonly entityStore: EntityStore,
    private readonly allowedScopes: AztecAddress[],
  ) {}

  createEntity(key: EntityKey, body: Fr[], originBlock: OriginBlock | undefined, jobId: string): Promise<void> {
    assertAllowedScope(key.scope, this.allowedScopes);
    return this.entityStore.createEntity(key, body, originBlock, jobId);
  }

  recordFact(
    key: EntityKey,
    factTypeId: Fr,
    payload: Fr[],
    originBlock: OriginBlock | undefined,
    jobId: string,
  ): Promise<void> {
    assertAllowedScope(key.scope, this.allowedScopes);
    return this.entityStore.recordFact(key, factTypeId, payload, originBlock, jobId);
  }

  terminateEntity(key: EntityKey, jobId: string): Promise<void> {
    assertAllowedScope(key.scope, this.allowedScopes);
    return this.entityStore.terminateEntity(key, jobId);
  }

  getEntity(key: EntityKey, jobId: string): Promise<Entity | undefined> {
    assertAllowedScope(key.scope, this.allowedScopes);
    return this.entityStore.getEntity(key, jobId);
  }

  getEntities(entityTypeKey: EntityTypeKey, jobId: string): Promise<Entity[]> {
    assertAllowedScope(entityTypeKey.scope, this.allowedScopes);
    return this.entityStore.getEntities(entityTypeKey, jobId);
  }
}
