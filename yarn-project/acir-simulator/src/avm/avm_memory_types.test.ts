import { FieldValue, Uint8, Uint32 } from './avm_memory_types.js';

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

describe('Uint32', () => {
  it('ands', () => {
    expect(new Uint32(0b11111110010011100100n).and(new Uint32(0b11100100111001001111n))).toEqual(
      new Uint32(0b11100100010001000100n),
    );
  });
});

describe('FieldValue', () => {
  it('xxx', () => {
    expect(new FieldValue(27).add(new FieldValue(48))).toEqual(new FieldValue(75));
  });
});
