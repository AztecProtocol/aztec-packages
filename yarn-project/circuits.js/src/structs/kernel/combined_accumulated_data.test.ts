import {
  makeFinalAccumulatedData,
  makePrivateAccumulatedData,
  makePublicAccumulatedData,
} from '../../tests/factories.js';
import {
  PrivateAccumulatedData,
  PrivateAccumulatedDataFinal,
  PublicAccumulatedData,
} from './combined_accumulated_data.js';

describe('PrivateAccumulatedData', () => {
  it('Data after serialization and deserialization is equal to the original', () => {
    const original = makePrivateAccumulatedData();
    const afterSerialization = PrivateAccumulatedData.fromBuffer(original.toBuffer());
    expect(original).toEqual(afterSerialization);
  });
});

describe('PublicAccumulatedData', () => {
  it('Data after serialization and deserialization is equal to the original', () => {
    const original = makePublicAccumulatedData();
    const afterSerialization = PublicAccumulatedData.fromBuffer(original.toBuffer());
    expect(original).toEqual(afterSerialization);
  });
});

describe('FinalAccumulatedData', () => {
  it('Data after serialization and deserialization is equal to the original', () => {
    const original = makeFinalAccumulatedData();
    const afterSerialization = PrivateAccumulatedDataFinal.fromBuffer(original.toBuffer());
    expect(original).toEqual(afterSerialization);
  });
});
