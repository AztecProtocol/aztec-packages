import { setupCustomSnapshotSerializers } from '@aztec/foundation/testing';

import { FunctionSelector } from './function_selector.js';

describe('FunctionSelector', () => {
  let selector: FunctionSelector;

  beforeAll(() => {
    setupCustomSnapshotSerializers(expect);
    selector = FunctionSelector.random();
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = selector.toBuffer();
    const res = FunctionSelector.fromBuffer(buffer);
    expect(res).toEqual(selector);
    expect(res.isEmpty()).toBe(false);
  });

  it('serializes to field and deserializes it back', () => {
    const field = selector.toField();
    const res = FunctionSelector.fromField(field);
    expect(res).toEqual(selector);
  });

  it('computes a function selector from signature', async () => {
    const res = await FunctionSelector.fromSignature('IS_VALID()');
    expect(res.toBuffer().toString('hex')).toMatchSnapshot();
  });

  it('computes a function selector from a long string', async () => {
    const res = await FunctionSelector.fromSignature('foo_and_bar_and_baz_and_foo_bar_baz_and_bar_foo');
    expect(res.toBuffer().toString('hex')).toMatchSnapshot();
  });
});
