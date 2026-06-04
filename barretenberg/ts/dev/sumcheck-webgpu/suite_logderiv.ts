// Suite: MegaFlavor LogDerivLookupRelation accumulate (13 Fr = 5+5+3) vs a
// polynomial reference of logderiv_lookup_relation.hpp; subrelation 1 is linearly
// dependent. Params [gamma, beta, beta^2, beta^3] via binding(3). See
// descriptors.ts. Row 0 forces q_lookup = read_counts = 0.

import { logderivDescriptor } from './descriptors.js';
import { type Suite, runRelationStandalone } from './harness.js';

export const logderivSuite: Suite = {
  id: logderivDescriptor.id,
  label: logderivDescriptor.label,
  run: ctx => runRelationStandalone(logderivDescriptor, ctx),
};
