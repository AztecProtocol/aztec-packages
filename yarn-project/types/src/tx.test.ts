import { MockTx } from './mocks.js';
import { Tx } from './tx.js';

describe('Tx', () => {
  it('convert to and from buffer', () => {
    const tx = MockTx();
    const buf = tx.toBuffer();
    expect(Tx.fromBuffer(buf)).toEqual(tx);
  });
});
