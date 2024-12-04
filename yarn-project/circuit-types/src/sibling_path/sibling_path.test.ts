import { jsonStringify } from '@aztec/foundation/json-rpc';

import { SiblingPath } from './sibling_path.js';

describe('SiblingPath', () => {
  it('serializes to JSON', () => {
    const path = SiblingPath.random(10);
    const json = jsonStringify(path);
    expect(SiblingPath.schema.parse(JSON.parse(json))).toEqual(path);
  });

  it('validates length', () => {
    const path = SiblingPath.random(10);
    const json = jsonStringify(path);
    expect(() => SiblingPath.schemaFor(12).parse(JSON.parse(json))).toThrow(
      expect.objectContaining({ name: 'ZodError' }),
    );
  });
});
