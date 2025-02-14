import { EthAddress } from '../eth-address/index.js';
import { Fq, Fr } from '../fields/fields.js';
import { resolver, reviver } from './type_registry.js';

class UnregisteredType {
  static random() {
    return new UnregisteredType();
  }

  toString() {
    return 'unregistered';
  }

  toJSON() {
    return this.toString();
  }

  fromString(_value: string) {
    return new UnregisteredType();
  }
}

describe('TypeRegistry', () => {
  it('serializes registered type with type info', () => {
    const data = { fr: Fr.random() };
    const json = JSON.stringify(data, resolver);
    const parsed = JSON.parse(json);
    expect(parsed.fr).toEqual({ type: 'Fr', value: data.fr.toString() });
  });

  it('deserializes registered types in objects', async () => {
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

  it('deserializes registered types in arrays', async () => {
    const data = [Fr.random(), Fq.random(), EthAddress.random()];

    const json = JSON.stringify(data, resolver);
    const parsed = JSON.parse(json, reviver);

    expect(parsed).toEqual(data);
    expect(parsed[0]).toBeInstanceOf(Fr);
    expect(parsed[1]).toBeInstanceOf(Fq);
    expect(parsed[3]).toBeInstanceOf(EthAddress);
  });

  it('ignores unregistered types', () => {
    const data = { unregistered: UnregisteredType.random() };
    const json = JSON.stringify(data, resolver);
    const parsed = JSON.parse(json);
    expect(parsed.unregistered).toEqual(data.unregistered.toString());
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
