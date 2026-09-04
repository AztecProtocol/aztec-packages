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
  it('serializes nested values to JSON', () => {
    const values = NestedProcessReturnValues.random(3);
    const json = jsonStringify(values);
    expect(NestedProcessReturnValues.schema.parse(JSON.parse(json))).toEqual(values);
  });
});
