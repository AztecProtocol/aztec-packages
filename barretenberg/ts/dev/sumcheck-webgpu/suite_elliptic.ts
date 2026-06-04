// Suite: MegaFlavor EllipticRelation accumulate (12 Fr = 2x6) vs a polynomial
// reference of elliptic_relation.hpp (curve_b = -17, Grumpkin). See
// descriptors.ts. Row 0 forces q_elliptic = 0.

import { ellipticDescriptor } from './descriptors.js';
import { type Suite, runRelationStandalone } from './harness.js';

export const ellipticSuite: Suite = {
  id: ellipticDescriptor.id,
  label: ellipticDescriptor.label,
  run: ctx => runRelationStandalone(ellipticDescriptor, ctx),
};
