import { EthAddress } from '../eth-address/index.js';
import { Fq, Fr } from '../fields/fields.js';
import { resolver, reviver } from './type_registry.js';

class NonRegisteredType {
  constructor(private value: number) {}

  toString() {
    return this.value.toString();
  }

  toJSON() {
    return this.toString();
  }

  fromString(value: string) {
    return new NonRegisteredType(parseInt(value));
  }

  static random() {
    // Determined by a fair dice roll.
    return new NonRegisteredType(4);
  }
}

describe('TypeRegistry', () => {
  it('serializes registered type with type info', () => {
    const data = { fr: Fr.random() };
    const json = JSON.stringify(data, resolver);
    const parsed = JSON.parse(json);
    expect(parsed.fr).toEqual({ type: 'Fr', value: data.fr.toString() });
  });

  it('deserializes registered types in objects', () => {
    const data = {
      fr: Fr.random(),
      fq: Fq.random(),
      ethAddress: EthAddress.random(),
    };

    const json = JSON.stringify(data, resolver);
    const parsed = JSON.parse(json, reviver);

    expect(parsed).toEqual(data);
    expect(parsed.fr).toBeInstanceOf(Fr);
    expect(parsed.fq).toBeInstanceOf(Fq);
    expect(parsed.ethAddress).toBeInstanceOf(EthAddress);
  });

  it('deserializes registered types in arrays', () => {
    const data = [Fr.random(), Fq.random(), EthAddress.random()];

    const json = JSON.stringify(data, resolver);
    const parsed = JSON.parse(json, reviver);

    expect(parsed).toEqual(data);
    expect(parsed[0]).toBeInstanceOf(Fr);
    expect(parsed[1]).toBeInstanceOf(Fq);
    expect(parsed[2]).toBeInstanceOf(EthAddress);
  });

  it('ignores unregistered types', () => {
    const data = { test: NonRegisteredType.random() };
    const json = JSON.stringify(data, resolver);
    const parsed = JSON.parse(json);
    expect(parsed.test).toEqual(data.test.toString());
  });

  it('handles plain objects', () => {
    const data = { obj: { number: 10, string: 'string', fr: Fr.random() } };
    const json = JSON.stringify(data, resolver);
    const parsed = JSON.parse(json, reviver);
    expect(parsed).toEqual(data);
    expect(parsed.obj.fr).toBeInstanceOf(Fr);
  });

  it('handles plain arrays', () => {
    const data = [10, 'string', Fr.random()];
    const json = JSON.stringify(data, resolver);
    const parsed = JSON.parse(json, reviver);
    expect(parsed).toEqual(data);
    expect(parsed[2]).toBeInstanceOf(Fr);
  });

  it('handles bigints', () => {
    const data = { bigInt: BigInt(10) };
    const json = JSON.stringify(data, resolver);
    const parsed = JSON.parse(json, reviver);
    expect(parsed.bigInt).toEqual(BigInt(10));
  });
});
