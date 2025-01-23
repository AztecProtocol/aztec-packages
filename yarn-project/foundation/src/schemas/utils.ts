import {
  OK,
  type ParseInput,
  type ParseReturnType,
  ZodFirstPartyTypeKind,
  type ZodObject,
  ZodOptional,
  ZodParsedType,
  type ZodRawShape,
  type ZodType,
  type ZodTypeAny,
  z,
} from 'zod';

import { pick } from '../collection/object.js';
import { isHex, withoutHexPrefix } from '../string/index.js';
import { type ZodFor } from './types.js';

export const hexSchema = z.string().refine(isHex, 'Not a valid hex string').transform(withoutHexPrefix);

// Copied from zod internals, which was copied from https://stackoverflow.com/questions/7860392/determine-if-string-is-in-base64-using-javascript
const base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;

/** Schema for a buffer represented as a base64 string. */
export const bufferSchema = z
  .string()
  // We only test the str for base64 if it's shorter than 1024 bytes, otherwise we've run into maximum
  // stack size exceeded errors when trying to validate excessively long strings (such as contract bytecode).
  .refine(str => str.length > 1024 || base64Regex.test(str), 'Not a valid base64 string')
  .transform(data => Buffer.from(data, 'base64'));

export class ZodNullableOptional<T extends ZodTypeAny> extends ZodOptional<T> {
  _isNullableOptional = true;

  override _parse(input: ParseInput): ParseReturnType<this['_output']> {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined || parsedType === ZodParsedType.null) {
      return OK(undefined);
    }
    return this._def.innerType._parse(input);
  }

  static override create<T extends ZodTypeAny>(type: T): ZodNullableOptional<T> {
    return new ZodNullableOptional({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodOptional,
    }) as any;
  }
}

/**
 * Declares a parameter as optional. Use this over z.optional in order to accept nulls as undefineds.
 * This is required as JSON does not have an undefined type, and null is used to represent it, so we
 * need to convert nulls to undefineds as we parse.
 */
export function optional<T extends ZodTypeAny>(schema: T) {
  return ZodNullableOptional.create(schema);
}

type ToJsonIs<T, TRet> = T extends { toJSON(): TRet } ? T : never;

/**
 * Creates a schema that accepts a hex string and uses it to hydrate an instance.
 * @param klazz - Class that implements either fromString or fromBuffer.
 * @returns A schema for the class.
 */
export function hexSchemaFor<TClass extends { fromString(str: string): any } | { fromBuffer(buf: Buffer): any }>(
  klazz: TClass,
  refinement?: (input: string) => boolean,
): ZodType<
  TClass extends { fromString(str: string): infer TInstance } | { fromBuffer(buf: Buffer): infer TInstance }
    ? ToJsonIs<TInstance, string>
    : never,
  any,
  string
> {
  const stringSchema = refinement ? z.string().refine(refinement, `Not a valid instance`) : z.string();
  const hexSchema = stringSchema.refine(isHex, 'Not a valid hex string');
  return 'fromString' in klazz
    ? hexSchema.transform(klazz.fromString.bind(klazz))
    : hexSchema.transform(str => Buffer.from(withoutHexPrefix(str), 'hex')).transform(klazz.fromBuffer.bind(klazz));
}

/**
 * Creates a schema that accepts a base64 string and uses it to hydrate an instance.
 * @param klazz - Class that implements fromBuffer.
 * @returns A schema for the class.
 */
export function bufferSchemaFor<TClass extends { fromBuffer(buf: Buffer): any }>(
  klazz: TClass,
): ZodType<
  TClass extends { fromBuffer(buf: Buffer): infer TInstance } ? ToJsonIs<TInstance, Buffer> : never,
  any,
  string
> {
  return bufferSchema.transform(klazz.fromBuffer.bind(klazz));
}

/** Creates a schema for a js Map type that matches the serialization used in jsonStringify. */
export function mapSchema<TKey, TValue>(key: ZodFor<TKey>, value: ZodFor<TValue>): ZodFor<Map<TKey, TValue>> {
  return z.array(z.tuple([key, value])).transform(entries => new Map(entries));
}

/** Creates a schema for a js Set type that matches the serialization used in jsonStringify. */
export function setSchema<T>(value: ZodFor<T>): ZodFor<Set<T>> {
  return z.array(value).transform(entries => new Set(entries));
}

/** Given an already parsed and validated object, extracts the keys defined in the given schema. Does not validate again. */
export function pickFromSchema<T extends object, S extends ZodObject<ZodRawShape>>(obj: T, schema: S) {
  return pick(obj, ...Object.keys(schema.shape));
}
