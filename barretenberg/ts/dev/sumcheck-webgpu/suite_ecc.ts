// Suite: MegaFlavor EccOpQueueRelation accumulate. The 24-Fr per-edge
// contribution (8 subrelations x 3) is diffed against a polynomial reference of
// ecc_op_queue_relation.hpp (see descriptors.ts). Row 0 forces
// lagrange_ecc_op = 0 (off-domain path).

import { eccDescriptor } from './descriptors.js';
import { type Suite, runRelationStandalone } from './harness.js';

export const eccSuite: Suite = {
  id: eccDescriptor.id,
  label: eccDescriptor.label,
  run: ctx => runRelationStandalone(eccDescriptor, ctx),
};
