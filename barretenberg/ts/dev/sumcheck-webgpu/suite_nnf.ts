// Suite: MegaFlavor NonNativeFieldRelation accumulate (6 Fr) vs a polynomial
// reference of non_native_field_relation.hpp. See descriptors.ts. Row 0 forces
// q_nnf = 0.

import { nnfDescriptor } from './descriptors.js';
import { type Suite, runRelationStandalone } from './harness.js';

export const nnfSuite: Suite = {
  id: nnfDescriptor.id,
  label: nnfDescriptor.label,
  run: ctx => runRelationStandalone(nnfDescriptor, ctx),
};
