import type { z } from 'zod';

import type { ZodNullableOptional } from './utils.js';

// Forces usage of ZodNullableOptional in parameters schemas so we properly accept nulls for optional parameters.
type ZodParameterTypeFor<T> = undefined extends T
  ? ZodNullableOptional<z.ZodType<T, z.ZodTypeDef, any>>
  : z.ZodType<T, z.ZodTypeDef, any>;

type ZodReturnTypeFor<T> = z.ZodType<T, z.ZodTypeDef, any>;

// This monstruosity is used for mapping function arguments to their schema representation.
// The complexity is required to satisfy ZodTuple which requires a fixed length tuple and
// has a very annoying type of [] | [ZodTypeAny, ...ZodTypeAny], and most types fail to match
// the second option. While a purely recursive approach works, it fails when trying to deal
// with optional arguments (ie optional items in the tuple), and ts does not really like them
// during a recursion and fails with infinite stack depth.
// This type appears to satisfy everyone. Everyone but me.
type ZodMapParameterTypes<T> = T extends []
  ? []
  : T extends [item: infer Head, ...infer Rest]
  ? [ZodParameterTypeFor<Head>, ...{ [K in keyof Rest]: ZodParameterTypeFor<Rest[K]> }]
  : T extends [item?: infer Head, ...infer Rest]
  ? [ZodNullableOptional<ZodParameterTypeFor<Head>>, ...{ [K in keyof Rest]: ZodParameterTypeFor<Rest[K]> }]
  : never;

export type ZodFunctionFor<Args, Ret> = z.ZodFunction<
  z.ZodTuple<ZodMapParameterTypes<Args>, z.ZodUnknown>,
  ZodReturnTypeFor<Ret>
>;

/** Generic Api schema not bounded to a specific implementation. */
export type ApiSchema = {
  [key: string]: ZodFunctionFor<any, any> | ApiSchemaFor<any>;
};

/** Maps all functions in an interface to their schema representation. */
export type ApiSchemaFor<T> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => Promise<infer Ret>
    ? ZodFunctionFor<Args, Ret>
    : ApiSchemaFor<T[K]>;
};

export function schemaKeyIsFunction<T>(schema: ApiSchemaFor<T>, key: string) {
  const maybeFn = schema[key as keyof T];
  return (
    maybeFn !== undefined &&
    typeof (maybeFn as ZodFunctionFor<any, any>).parameters === 'function' &&
    typeof (maybeFn as ZodFunctionFor<any, any>).returnType === 'function'
  );
}

/**
 * Return whether an API schema defines a valid getter schema for a given method name,
 * or if a nested schema does with a prefixed method name.
 */
export function schemaHasKey<T>(schema: ApiSchemaFor<T>, key: string) {
  const hasOwnKey = Object.hasOwn(schema, key);

  const [nestedObj, nestedKey] = key.split('_');
  const hasNestedKey =
    Object.hasOwn(schema, nestedObj) &&
    typeof schema[nestedObj as keyof T] === 'object' &&
    Object.hasOwn(schema[nestedObj as keyof T], nestedKey);
  return typeof key === 'string' && (hasOwnKey || hasNestedKey);
}
