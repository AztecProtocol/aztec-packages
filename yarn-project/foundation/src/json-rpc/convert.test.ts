import { Buffer } from 'buffer';
import { type ZodTypeAny, z } from 'zod';

import { mapSchema, setSchema } from '../schemas/utils.js';
import { ClassConverter } from './class_converter.js';
import { convertBigintsInObj, convertFromJsonObj, convertToJsonObj, jsonStringify2 } from './convert.js';
import { ToStringClass as ToStringClassA } from './fixtures/class_a.js';
import { ToStringClass as ToStringClassB } from './fixtures/class_b.js';
import { TestNote } from './fixtures/test_state.js';

const TEST_BASE64 = 'YmFzZTY0IGRlY29kZXI=';

describe('convert', () => {
  it('test an RPC function over client', () => {
    const cc = new ClassConverter({ TestNote });
    const buffer = Buffer.from(TEST_BASE64, 'base64');
    expect(convertFromJsonObj(cc, convertToJsonObj(cc, buffer)).toString('base64')).toBe(TEST_BASE64);
    const note = new TestNote('1');
    expect(convertFromJsonObj(cc, convertToJsonObj(cc, note))).toBeInstanceOf(TestNote);
    expect(convertFromJsonObj(cc, convertToJsonObj(cc, note)).toString()).toBe('1');
  });

  it('converts a bigint', () => {
    expect(convertBigintsInObj(10n)).toEqual({ type: 'bigint', data: '10' });
    expect(convertBigintsInObj({ value: 10n })).toEqual({ value: { type: 'bigint', data: '10' } });
    expect(convertBigintsInObj([10n])).toEqual([{ type: 'bigint', data: '10' }]);
  });

  it('does not convert a string', () => {
    expect(convertBigintsInObj('hello')).toEqual('hello');
    expect(convertBigintsInObj({ msg: 'hello' })).toEqual({ msg: 'hello' });
  });

  it('converts a registered class', () => {
    const cc = new ClassConverter({ ToStringClass: ToStringClassA });
    const obj = { content: new ToStringClassA('a', 'b') };
    const serialized = convertToJsonObj(cc, obj);
    const deserialized = convertFromJsonObj(cc, serialized) as { content: ToStringClassA };
    expect(deserialized.content).toBeInstanceOf(ToStringClassA);
    expect(deserialized.content.x).toEqual('a');
    expect(deserialized.content.y).toEqual('b');
  });

  it('converts a class by name in the event of duplicate modules being loaded', () => {
    expect(ToStringClassA.prototype.constructor.name).toEqual('ToStringClass');
    expect(ToStringClassB.prototype.constructor.name).toEqual('ToStringClass');
    const cc = new ClassConverter({ ToStringClass: ToStringClassA });
    const obj = { content: new ToStringClassB('a', 'b') };
    const serialized = convertToJsonObj(cc, obj);
    const deserialized = convertFromJsonObj(cc, serialized) as { content: ToStringClassA };
    expect(deserialized.content).toBeInstanceOf(ToStringClassA);
    expect(deserialized.content.x).toEqual('a');
    expect(deserialized.content.y).toEqual('b');
  });

  it('converts a class by constructor instead of name in the event of minified bundle', () => {
    const cc = new ClassConverter({ NotMinifiedToStringClassName: ToStringClassA });
    const obj = { content: new ToStringClassA('a', 'b') };
    const serialized = convertToJsonObj(cc, obj);
    const deserialized = convertFromJsonObj(cc, serialized) as { content: ToStringClassA };
    expect(deserialized.content).toBeInstanceOf(ToStringClassA);
    expect(deserialized.content.x).toEqual('a');
    expect(deserialized.content.y).toEqual('b');
  });

  it('converts a plain object', () => {
    const obj = { a: 10, b: [20, 30], c: 'foo' };
    const cc = new ClassConverter();
    expect(convertFromJsonObj(cc, convertToJsonObj(cc, obj))).toEqual(obj);
  });

  it('refuses to convert to json an unknown class', () => {
    const cc = new ClassConverter();
    expect(() => convertToJsonObj(cc, { content: new ToStringClassA('a', 'b') })).toThrow(/not registered/);
  });

  it('refuses to convert from json an unknown class', () => {
    const cc = new ClassConverter({ ToStringClass: ToStringClassA });
    const serialized = convertToJsonObj(cc, { content: new ToStringClassA('a', 'b') });
    expect(() => convertFromJsonObj(new ClassConverter(), serialized)).toThrow(/not registered/);
  });
});

describe('jsonStringify2', () => {
  const test = (value: any, schema: ZodTypeAny) => {
    const json = jsonStringify2(value);
    expect(schema.parse(JSON.parse(json))).toEqual(value);
  };

  it('object with primitive types', () => {
    const values = { a: 10, b: 'foo', c: true };
    test(values, z.object({ a: z.number(), b: z.string(), c: z.boolean() }));
  });

  it('object with bigints', () => {
    const values = { a: 10n };
    test(values, z.object({ a: z.coerce.bigint() }));
  });

  it('tuples', () => {
    const values = [10, 'foo', true];
    test(values, z.tuple([z.number(), z.string(), z.boolean()]));
  });

  it('arrays', () => {
    const values = [10, 20, 30];
    test(values, z.array(z.number()));
  });

  it('maps', () => {
    const values = new Map([
      ['a', 10],
      ['b', 20],
    ]);
    test(values, mapSchema(z.string(), z.number()));
  });

  it('sets', () => {
    const values = new Set([10, 20]);
    test(values, setSchema(z.number()));
  });
});
