import type { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';

import type { EphemeralArrayService } from '../ephemeral_array_service.js';
import type { TypeMapping } from '../oracle/oracle_registry.js';

/**
 * TypeScript counterpart of Noir's `EphemeralArray<T>`.
 *
 * An ephemeral array looks very different depending on whether it's being produced (as an oracle return value) or
 * consumed (as an oracle parameter), so we use a discriminated state to model both without leaking those details to
 * callers:
 *
 * - As a return value (`output` mode), what we have are the typed values the oracle just computed. The slot is just
 *   an implementation detail of how those values get handed back to ACVM, so we hold onto the values and the service
 *   they will eventually live in, and only materialize a slot when something actually asks for it.
 *
 * - As a parameter (`input` mode), what we have is a slot pointing at fields ACVM already wrote into the service,
 *   plus the TypeMapping that knows how to interpret those fields. We hold onto both so callers can later ask for
 *   the typed values without having to think about deserialization.
 *
 * In both modes the idea is the same: store everything we already know at construction time, so the rest of the
 * code can work with typed values and never touch slots, services, or TypeMappings directly.
 */
export class EphemeralArray<T> {
  private constructor(private readonly state: EphemeralArrayState<T>) {}

  /** Create an output-mode array carrying typed values. The service is only used if/when the slot is materialized. */
  static fromValues<T>(service: EphemeralArrayService, values: T[]): EphemeralArray<T> {
    return new EphemeralArray({ kind: 'output', service, values });
  }

  /** Wrap an existing slot. Intended for the EPHEMERAL_ARRAY combinator during ACVM deserialization. */
  static fromSlot<T>(slot: Fr, mapping: TypeMapping<T>): EphemeralArray<T> {
    return new EphemeralArray({ kind: 'input', slot, mapping });
  }

  /**
   * Returns the slot, materializing values into the service on first call for output-mode arrays.
   * Intended for the EPHEMERAL_ARRAY combinator during ACVM serialization.
   */
  materializeSlot(serializeItem: (v: T) => Fr[]): Fr {
    if (this.state.kind === 'input') {
      return this.state.slot;
    }
    if (this.state.cachedSlot === undefined) {
      this.state.cachedSlot = this.state.service.newArray(this.state.values.map(serializeItem));
    }
    return this.state.cachedSlot;
  }

  /** Read all elements: returns stored values for output-mode arrays, deserializes from the service for input-mode. */
  readAll(service: EphemeralArrayService): T[] {
    if (this.state.kind === 'output') {
      return this.state.values;
    }
    const mapping = this.state.mapping;
    return service
      .readArrayAt(this.state.slot)
      .map(fields => mapping.deserialization!.fn([FieldReader.asReader(fields)]));
  }
}

type EphemeralArrayState<T> =
  | { kind: 'output'; service: EphemeralArrayService; values: T[]; cachedSlot?: Fr }
  | { kind: 'input'; slot: Fr; mapping: TypeMapping<T> };
