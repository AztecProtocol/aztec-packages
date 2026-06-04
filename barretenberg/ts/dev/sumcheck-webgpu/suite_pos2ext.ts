// Suite: MegaFlavor Poseidon2ExternalRelation accumulate (28 Fr = 4x7) vs a
// polynomial reference of poseidon2_external_relation.hpp (v = M_E*(w+c)^5 = w_shift).
// See descriptors.ts. Row 0 forces q_poseidon2_external = 0.

import { pos2ExtDescriptor } from './descriptors.js';
import { type Suite, runRelationStandalone } from './harness.js';

export const pos2ExtSuite: Suite = {
  id: pos2ExtDescriptor.id,
  label: pos2ExtDescriptor.label,
  run: ctx => runRelationStandalone(pos2ExtDescriptor, ctx),
};
