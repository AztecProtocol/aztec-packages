// Suite: MegaFlavor Poseidon2QuadInternalTerminalRelation accumulate (28 Fr = 4x7)
// vs a polynomial reference of poseidon2_quad_internal_terminal_relation.hpp
// (closed_form from cuzk/poseidon2_quad_consts.ts). See descriptors.ts. Row 0
// forces q_sel = 0.

import { pos2QuadTermDescriptor } from './descriptors.js';
import { type Suite, runRelationStandalone } from './harness.js';

export const pos2QuadTermSuite: Suite = {
  id: pos2QuadTermDescriptor.id,
  label: pos2QuadTermDescriptor.label,
  run: ctx => runRelationStandalone(pos2QuadTermDescriptor, ctx),
};
