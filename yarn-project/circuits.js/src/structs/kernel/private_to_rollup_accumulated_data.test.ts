import { makePrivateToRollupAccumulatedData } from '../../tests/factories.js';
import { PrivateToRollupAccumulatedData } from './private_to_rollup_accumulated_data.js';

describe('PrivateToRollupAccumulatedData', () => {
  it('Data after serialization and deserialization is equal to the original', () => {
    const original = makePrivateToRollupAccumulatedData();
    const afterSerialization = PrivateToRollupAccumulatedData.fromBuffer(original.toBuffer());
    expect(original).toEqual(afterSerialization);
  });
});
