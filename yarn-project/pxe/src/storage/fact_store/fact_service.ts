import { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { Origin } from '../foundation/origin.js';
import type { EntityTypeId, FactStore, FactTypeId, StoredFact } from './fact_store.js';

/** Scope-guarded façade over {@link FactStore}, mirroring `CapsuleService`. */
export class FactService {
  constructor(
    private readonly factStore: FactStore,
    private readonly allowedScopes: AztecAddress[],
  ) {}

  recordFact(
    contract: AztecAddress,
    scope: AztecAddress,
    entityType: EntityTypeId,
    factType: FactTypeId,
    correlationKey: Buffer,
    payload: Buffer,
    origin: Origin | null,
    jobId: string,
  ): Promise<void> {
    assertAllowedScope(scope, this.allowedScopes);
    return this.factStore.put(contract, scope, entityType, factType, correlationKey, payload, origin, jobId);
  }

  loadCanonicalFactSet(
    contract: AztecAddress,
    scope: AztecAddress,
    entityType: EntityTypeId,
    correlationKey: Buffer,
    jobId: string,
  ): Promise<StoredFact[]> {
    assertAllowedScope(scope, this.allowedScopes);
    return this.factStore.loadCanonicalFactSet(contract, scope, entityType, correlationKey, jobId);
  }

  activeEntities(
    contract: AztecAddress,
    scope: AztecAddress,
    entityType: EntityTypeId,
    jobId: string,
  ): Promise<Buffer[]> {
    assertAllowedScope(scope, this.allowedScopes);
    return this.factStore.activeEntities(contract, scope, entityType, jobId);
  }

  terminateEntity(
    contract: AztecAddress,
    scope: AztecAddress,
    entityType: EntityTypeId,
    correlationKey: Buffer,
    jobId: string,
  ): Promise<void> {
    assertAllowedScope(scope, this.allowedScopes);
    return this.factStore.terminate(contract, scope, entityType, correlationKey, jobId);
  }
}

function assertAllowedScope(scope: AztecAddress, allowedScopes: AztecAddress[]) {
  if (scope.equals(AztecAddress.ZERO)) {
    return;
  }
  if (!allowedScopes.some(allowed => allowed.equals(scope))) {
    throw new Error(
      `Scope ${scope.toString()} is not in the allowed scopes list: [${allowedScopes.map(s => s.toString()).join(', ')}].`,
    );
  }
}
