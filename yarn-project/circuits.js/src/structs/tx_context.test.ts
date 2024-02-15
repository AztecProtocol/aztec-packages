import { makeTxContext } from '../tests/factories.js';
import { TxContext } from './tx_context.js';

describe('TxContext', () => {
  it(`serializes to buffer and deserializes it back`, () => {
    const expected = makeTxContext(1);
    const buffer = expected.toBuffer();
    const res = TxContext.fromBuffer(buffer);
    expect(res).toEqual(expected);
    expect(res.isEmpty()).toBe(false);
  });

  it(`initializes an empty TxContext`, () => {
    const target = TxContext.empty();
    expect(target.isEmpty()).toBe(true);
  });

  it('computes empty hash', () => {
    const tc = TxContext.empty();
    expect(tc.isEmpty()).toBe(true);
    
    const hash = tc.hash();
    expect(hash).toMatchSnapshot();

    // Value used in empty_hash test in contract_deployment_data.nr
    console.log("hash", hash.toString());
  });
});
