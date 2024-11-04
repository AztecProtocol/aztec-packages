import { type z } from 'zod';

type ZodFor<T> = z.ZodType<T, z.ZodTypeDef, any>;
type ZodMapTypes<T> = T extends []
  ? []
  : T extends [infer Head, ...infer Rest]
  ? [ZodFor<Head>, ...ZodMapTypes<Rest>]
  : never;

/** Maps all functions in an interface to their schema representation. */
export type ApiSchemaFor<T> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => Promise<infer Ret>
    ? z.ZodFunction<z.ZodTuple<ZodMapTypes<Args>, z.ZodUnknown>, ZodFor<Ret>>
    : never;
};

/** Generic Api schema not bounded to a specific implementation. */
export type ApiSchema = {
  [key: string]: z.ZodFunction<z.ZodTuple<any, any>, z.ZodTypeAny>;
};

/** Return whether an API schema defines a valid function schema for a given method name. */
export function schemaHasMethod(schema: ApiSchema, methodName: string) {
  return (
    typeof methodName === 'string' &&
    Object.hasOwn(schema, methodName) &&
    typeof schema[methodName].parameters === 'function' &&
    typeof schema[methodName].returnType === 'function'
  );
}
