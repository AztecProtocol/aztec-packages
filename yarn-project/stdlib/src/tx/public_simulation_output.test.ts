import { jsonStringify } from '@aztec/foundation/json-rpc';

import { NestedProcessReturnValues, PublicSimulationOutput } from './public_simulation_output.js';

describe('PublicSimulationOutput', () => {
  it('serializes to JSON', async () => {
    const output = await PublicSimulationOutput.random();
    const json = jsonStringify(output);
    expect(PublicSimulationOutput.schema.parse(JSON.parse(json))).toEqual(output);
  });
});

describe('NestedProcessReturnValues', () => {
  // The schema refers to itself through `z.lazy`, and zod ties that recursion together by object identity:
  // handing back a fresh schema on each access makes it recurse until the stack overflows (zod >= 4.5).
  it('hands out the same schema instance on every access', () => {
    expect(NestedProcessReturnValues.schema).toBe(NestedProcessReturnValues.schema);
  });

  it('round trips nested return values', () => {
    const values = NestedProcessReturnValues.random(3);
    const parsed = NestedProcessReturnValues.schema.parse(JSON.parse(jsonStringify(values)));
    expect(parsed.equals(values)).toBe(true);
  });
});
