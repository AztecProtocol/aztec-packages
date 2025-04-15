import { jsonStringify } from '@aztec/foundation/json-rpc';

import { PublicSimulationOutput } from './public_simulation_output.js';

describe('PublicSimulationOutput', () => {
  it('serializes to JSON', async () => {
    const output = await PublicSimulationOutput.random();
    const json = jsonStringify(output);
    expect(PublicSimulationOutput.schema.parse(JSON.parse(json))).toEqual(output);
  });
});
