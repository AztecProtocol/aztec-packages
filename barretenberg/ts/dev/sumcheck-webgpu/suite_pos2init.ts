// Suite: MegaFlavor Poseidon2InitialExternalRelation accumulate. The 12-Fr
// per-edge contribution (4 subrelations x 3) is diffed against a polynomial
// reference of poseidon2_initial_external_relation.hpp (see descriptors.ts).
// Row 0 forces q_poseidon2_external_initial = 0 (skip path).

import { pos2InitDescriptor } from './descriptors.js';
import { type Suite, runRelationStandalone } from './harness.js';

export const pos2InitSuite: Suite = {
  id: pos2InitDescriptor.id,
  label: pos2InitDescriptor.label,
  run: ctx => runRelationStandalone(pos2InitDescriptor, ctx),
};
