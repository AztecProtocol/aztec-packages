// Suite: MegaFlavor UltraPermutationRelation accumulate (12 Fr = 6+3+3) vs a
// polynomial reference of permutation_relation.hpp; beta/gamma/public_input_delta
// via binding(3). See descriptors.ts. Row 0 forces z_perm_shift = z_perm.

import { permDescriptor } from './descriptors.js';
import { type Suite, runRelationStandalone } from './harness.js';

export const permSuite: Suite = {
  id: permDescriptor.id,
  label: permDescriptor.label,
  run: ctx => runRelationStandalone(permDescriptor, ctx),
};
