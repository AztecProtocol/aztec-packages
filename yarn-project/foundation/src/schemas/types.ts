import type { ZodType } from 'zod';

export type ZodFor<T> = ZodType<T, any, any>;

/**
 * Creates a schema validator that enforces all properties of type T are present in the schema.
 * This provides compile-time safety to ensure schemas don't miss optional properties.
 *
 * @example
 * ```ts
 * interface MyConfig {
 *   foo: string;
 *   bar?: number;
 * }
 *
 * // ✅ This will work - all keys present
 * const schema1 = zodFor<MyConfig>()(z.object({
 *   foo: z.string(),
 *   bar: z.number().optional(),
 * }));
 *
 * // ❌ This will error - 'bar' is missing
 * const schema2 = zodFor<MyConfig>()(z.object({
 *   foo: z.string(),
 * }));
 * ```
 */
export function zodFor<T>() {
  return (schema => schema) as <S extends ZodType<any, any, any>>(
    schema: keyof T extends keyof S['_output']
      ? keyof S['_output'] extends keyof T
        ? S
        : S & { __error__: 'Schema has extra keys not in type'; __extra__: Exclude<keyof S['_output'], keyof T> }
      : S & { __error__: 'Schema is missing keys from type'; __missing__: Exclude<keyof T, keyof S['_output']> },
  ) => S;
}
