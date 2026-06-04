// Suite: MegaFlavor ArithmeticRelation accumulate. The 11-Fr per-edge
// contribution is diffed against a polynomial reference of
// ultra_arithmetic_relation.hpp (see descriptors.ts). Rows 0-3 force
// q_arith in {0,1,2,3}.

import { arithDescriptor } from './descriptors.js';
import { type Suite, runRelationStandalone } from './harness.js';

export const arithSuite: Suite = {
  id: arithDescriptor.id,
  label: arithDescriptor.label,
  run: ctx => runRelationStandalone(arithDescriptor, ctx),
};
