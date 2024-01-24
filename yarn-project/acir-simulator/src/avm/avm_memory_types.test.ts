import { Uint8, FieldValue } from './avm_memory_types.js';

describe('Uint8', () => {
  it('Unsigned 8 max value', () => {
    expect(new Uint8(255).toBigInt()).toEqual(255n);
  });

  it('Unsigned 8 bit add', () => {
    expect(new Uint8(50).add(new Uint8(20))).toEqual(new Uint8(70));
  });

  it('Unsigned 8 bit add wraps', () => {
    expect(new Uint8(200).add(new Uint8(100))).toEqual(new Uint8(44));
  });
});

describe('FieldValue', () => {
  it('xxx', () => {
    expect(new FieldValue(27).add(new FieldValue(48))).toEqual(new FieldValue(75));
  });
});