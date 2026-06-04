// Suite: MegaFlavor MemoryRelation accumulate (36 Fr = 6x6) vs a polynomial
// reference of memory_relation.hpp. Params [eta, eta_two, eta_three] via
// binding(3). See descriptors.ts. Row 0 forces q_memory = 0.

import { memoryDescriptor } from './descriptors.js';
import { type Suite, runRelationStandalone } from './harness.js';

export const memorySuite: Suite = {
  id: memoryDescriptor.id,
  label: memoryDescriptor.label,
  run: ctx => runRelationStandalone(memoryDescriptor, ctx),
};
