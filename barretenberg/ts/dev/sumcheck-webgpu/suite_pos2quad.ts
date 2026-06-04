// Suite: MegaFlavor Poseidon2QuadInternalRelation accumulate (28 Fr = 4x7) vs a
// polynomial reference of poseidon2_quad_internal_relation.hpp (closed_form[0] +
// forward_vandermonde_lhs from cuzk/poseidon2_quad_consts.ts). See descriptors.ts.
// Row 0 forces q_sel = 0.

import { pos2QuadDescriptor } from './descriptors.js';
import { type Suite, runRelationStandalone } from './harness.js';

export const pos2QuadSuite: Suite = {
  id: pos2QuadDescriptor.id,
  label: pos2QuadDescriptor.label,
  run: ctx => runRelationStandalone(pos2QuadDescriptor, ctx),
};
