/**
 * Field classes - re-exported from barretenberg/ts.
 * All field functionality is now in @aztec/bb.js for consolidation.
 */
import { Bn254Fq, Bn254Fr, GrumpkinFq } from '@aztec/bb.js/types/fields';

import { hexSchemaFor } from '../schemas/utils.js';
import { TypeRegistry } from '../serialize/type_registry.js';

// Re-export field classes with foundation aliases
export { Bn254Fr, Bn254Fq, GrumpkinFq };
export { Bn254Fr as Fr, Bn254Fq as Fq, Bn254Fq as GrumpkinScalar } from '@aztec/bb.js/types/fields';

// Schemas for Fr and Fq (used by foundation's schema system)
export const FrSchema = hexSchemaFor(Bn254Fr);
export const FqSchema = hexSchemaFor(Bn254Fq);

// Register for JSON deserializing
TypeRegistry.register('Fr', Bn254Fr);
TypeRegistry.register('Fq', Bn254Fq);

// Helper function for reducing buffers to fields
export function reduceFn<TInput>(fn: (input: TInput) => Buffer, FieldClass: typeof Bn254Fr | typeof Bn254Fq) {
  return (input: TInput) => FieldClass.fromBufferReduce(fn(input));
}

// If we are in test mode, we register a special equality for fields
if (process.env.NODE_ENV === 'test') {
  const areFieldsEqual = (a: unknown, b: unknown): boolean | undefined => {
    const isAField = a instanceof Bn254Fr || a instanceof Bn254Fq;
    const isBField = b instanceof Bn254Fr || b instanceof Bn254Fq;

    if (isAField && isBField) {
      return (a as Bn254Fr | Bn254Fq).equals(b as Bn254Fr | Bn254Fq);
    } else if (isAField === isBField) {
      return undefined;
    } else {
      return false;
    }
  };

  if (typeof expect !== 'undefined') {
    // `addEqualityTesters` doesn't seem to be in the types yet.
    (expect as any).addEqualityTesters([areFieldsEqual]);
  } else {
    (globalThis as any).__extraEqualityTesters ??= [];
    (globalThis as any).__extraEqualityTesters.push(areFieldsEqual);
  }
}
