import type { z } from 'zod';

import type { ZodNullableOptional } from './utils.js';

// Forces usage of schemas that accept nulls for optional parameters.
type ZodParameterTypeFor<T> = undefined extends T ? ZodNullableOptional<z.ZodType<T, any>> : z.ZodType<T, any>;

type ZodReturnTypeFor<T> = z.ZodType<T, any>;

type ZodMapParameterTypes<T extends readonly unknown[]> = {
  [K in keyof T]-?: ZodParameterTypeFor<T[K]>;
};

/** Maps all functions in an interface to their schema representation. */
export type ApiSchemaFor<T> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => Promise<infer Ret>
    ? z.ZodFunction<z.ZodTuple<ZodMapParameterTypes<Args>, null>, ZodReturnTypeFor<Ret>>
    : never;
};

/** Generic Api schema not bounded to a specific implementation. */
export type ApiSchema = {
  [key: string]: z.ZodFunction<z.ZodTuple<any, any>, z.ZodTypeAny>;
};

/** Return whether an API schema defines a valid function schema for a given method name. */
export function schemaHasMethod<T extends ApiSchema>(
  schema: T,
  methodName: string,
): methodName is Extract<keyof T, string> {
  return (
    typeof methodName === 'string' &&
    Object.hasOwn(schema, methodName) &&
    schema[methodName].def.input !== undefined &&
    schema[methodName].def.output !== undefined
  );
}

/** Returns the parameter tuple schema for an API method schema. */
export function getSchemaParameters<T extends z.ZodFunction<z.ZodTuple<any, any>, z.ZodTypeAny>>(schema: T) {
  return schema.def.input;
}

/** Returns the return value schema for an API method schema. */
export function getSchemaReturnType<T extends z.ZodFunction<z.ZodTuple<any, any>, z.ZodTypeAny>>(schema: T) {
  return schema.def.output;
}
