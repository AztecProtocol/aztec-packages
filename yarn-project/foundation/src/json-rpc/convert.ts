import { Buffer } from 'buffer';

import { type ZodFor } from '../schemas/types.js';

/**
 * Parses a json string and then feeds it to a zod schema.
 * @param json - JSON string.
 * @param schema - Zod schema.
 * @returns Result of parsing json with schema.
 */
export function jsonParseWithSchema<T>(json: string, schema: ZodFor<T>): T {
  return schema.parse(JSON.parse(json));
}

/**
 * JSON.stringify helper that stringifies bigints, buffers, maps, and sets.
 * @param obj - The object to be stringified.
 * @returns The resulting string.
 */
export function jsonStringify(obj: object, prettify?: boolean): string {
  return JSON.stringify(
    obj,
    (_key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      } else if (typeof value === 'object' && value && value.type === 'Buffer' && Array.isArray(value.data)) {
        return Buffer.from(value.data).toString('base64');
      } else if (typeof value === 'object' && value && Buffer.isBuffer(value)) {
        return value.toString('base64');
      } else if (typeof value === 'object' && value instanceof Map) {
        return Array.from(value.entries());
      } else if (typeof value === 'object' && value instanceof Set) {
        return Array.from(value.values());
      } else {
        return value;
      }
    },
    prettify ? 2 : 0,
  );
}

/**
 * Calls jsonStringify but swallows errors.
 * Use for logging, when you don't want to potentially introduce another thing that throws.
 */
export function tryJsonStringify(obj: any, prettify?: boolean): string | undefined {
  try {
    return jsonStringify(obj, prettify);
  } catch (e) {
    return undefined;
  }
}
