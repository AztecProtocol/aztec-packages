import { HistoricalBlockData } from './historical_block_data.js';

describe('HistoricalBlockData', () => {
  it('serializes to buffer and back', () => {
    const historicalBlockData = HistoricalBlockData.random();
    const serialized = historicalBlockData.toBuffer();
    const deserialized = HistoricalBlockData.fromBuffer(serialized);
    expect(deserialized).toEqual(historicalBlockData);
  });

  it('serializes to string and back', () => {
    const historicalBlockData = HistoricalBlockData.random();
    const serialized = historicalBlockData.toString();
    const deserialized = HistoricalBlockData.fromString(serialized);
    expect(deserialized).toEqual(historicalBlockData);
  });
});
