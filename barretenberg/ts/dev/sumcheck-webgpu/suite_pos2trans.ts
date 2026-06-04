// Suite: MegaFlavor Poseidon2TransitionEntryRelation accumulate (21 Fr = 3x7) vs
// a polynomial reference of poseidon2_transition_entry_relation.hpp (constants
// from cuzk/poseidon2_quad_consts.ts). See descriptors.ts. Row 0 forces q_sel = 0.

import { pos2TransDescriptor } from './descriptors.js';
import { type Suite, runRelationStandalone } from './harness.js';

export const pos2TransSuite: Suite = {
  id: pos2TransDescriptor.id,
  label: pos2TransDescriptor.label,
  run: ctx => runRelationStandalone(pos2TransDescriptor, ctx),
};
