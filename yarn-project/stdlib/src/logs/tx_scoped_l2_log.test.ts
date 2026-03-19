import { TxScopedL2Log } from './tx_scoped_l2_log.js';

describe('TxScopedL2Log', () => {
  it('should serialize and deserialize correctly', () => {
    const log = TxScopedL2Log.random();
    const buffer = log.toBuffer();
    const deserializedLog = TxScopedL2Log.fromBuffer(buffer);
    expect(deserializedLog.equals(log)).toBe(true);
  });

  it('should extract block number from buffer correctly', () => {
    const log = TxScopedL2Log.random();
    const buffer = log.toBuffer();
    const blockNumber = TxScopedL2Log.getBlockNumberFromBuffer(buffer);
    expect(blockNumber).toBe(log.blockNumber);
  });
});
