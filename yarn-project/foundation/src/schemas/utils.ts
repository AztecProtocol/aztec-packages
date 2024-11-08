import {
  OK,
  type ParseInput,
  type ParseReturnType,
  ZodFirstPartyTypeKind,
  ZodOptional,
  ZodParsedType,
  type ZodType,
  type ZodTypeAny,
  z,
} from 'zod';

import { isHex, withoutHexPrefix } from '../string/index.js';
import { type ZodFor } from './types.js';

export const hexSchema = z.string().refine(isHex, 'Not a valid hex string').transform(withoutHexPrefix);

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

/**
 * Creates a schema that accepts a hex string and uses it to hydrate an instance.
 * @param klazz - Class that implements either fromString or fromBuffer.
 * @returns A schema for the class.
 */
export function hexSchemaFor<TClass extends { fromString(str: string): any } | { fromBuffer(buf: Buffer): any }>(
  klazz: TClass,
): ZodType<
  TClass extends { fromString(str: string): infer TInstance } | { fromBuffer(buf: Buffer): infer TInstance }
    ? TInstance
    : never,
  any,
  string
> {
  return 'fromString' in klazz
    ? hexSchema.transform(klazz.fromString.bind(klazz))
    : hexSchema.transform(str => Buffer.from(str, 'hex')).transform(klazz.fromBuffer.bind(klazz));
}

// TODO(palla/schemas): Delete this class once all serialization of the type { type: string, value: string } are removed.
export function maybeStructuredStringSchemaFor<TClass extends { fromString(str: string): any }>(
  name: string,
  klazz: TClass,
  refinement?: (input: string) => boolean,
): ZodFor<TClass extends { fromString(str: string): infer TInstance } ? TInstance : never> {
  const stringSchema = refinement ? z.string().refine(refinement, `Not a valid ${name}`) : z.string();
  return z
    .union([stringSchema, z.object({ type: z.literal(name), value: stringSchema })])
    .transform(input => klazz.fromString(typeof input === 'string' ? input : input.value));
}

/** Creates a schema for a js Map type that matches the serialization used in jsonStringify. */
export function mapSchema<TKey, TValue>(key: ZodFor<TKey>, value: ZodFor<TValue>): ZodFor<Map<TKey, TValue>> {
  return z.array(z.tuple([key, value])).transform(entries => new Map(entries));
}

/** Creates a schema for a js Set type that matches the serialization used in jsonStringify. */
export function setSchema<T>(value: ZodFor<T>): ZodFor<Set<T>> {
  return z.array(value).transform(entries => new Set(entries));
}
