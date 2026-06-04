// Suite: MegaFlavor DeltaRangeConstraintRelation accumulate. The 24-Fr per-edge
// contribution (4 subrelations x 6) is diffed against a polynomial reference of
// delta_range_constraint_relation.hpp (see descriptors.ts). Row 0 forces
// q_delta_range = 0 (skip path).

import { deltaDescriptor } from './descriptors.js';
import { type Suite, runRelationStandalone } from './harness.js';

export const deltaSuite: Suite = {
  id: deltaDescriptor.id,
  label: deltaDescriptor.label,
  run: ctx => runRelationStandalone(deltaDescriptor, ctx),
};
