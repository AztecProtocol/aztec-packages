import { PRIVATE_CALL_STACK_ITEM_LENGTH } from '../constants.gen.js';
import { makePrivateCallStackItem } from '../tests/factories.js';
import { PrivateCallStackItem } from './private_call_stack_item.js';

describe('PrivateCallStackItem', () => {
  let inputs: PrivateCallStackItem;

  beforeAll(() => {
    const randomInt = Math.floor(Math.random() * 1000);
    inputs = makePrivateCallStackItem(randomInt);
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = inputs.toBuffer();
    const res = PrivateCallStackItem.fromBuffer(buffer);
    expect(res).toEqual(inputs);
  });

  it('serializes to field array and deserializes it back', () => {
    const fieldArray = inputs.toFields();
    const res = PrivateCallStackItem.fromFields(fieldArray);
    expect(res).toEqual(inputs);
  });

  it('number of fields matches constant', () => {
    const fields = inputs.toFields();
    expect(fields.length).toBe(PRIVATE_CALL_STACK_ITEM_LENGTH);
  });

  it('computes hash', () => {
    const seed = 9870243;
    const PrivateCallStackItem = makePrivateCallStackItem(seed);
    const hash = PrivateCallStackItem.hash();
    expect(hash).toMatchSnapshot();
  });
});
