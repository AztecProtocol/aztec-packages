import { z } from 'zod';

/** Parses the given arguments using a tuple from the provided schemas. */
export function parse<T extends [] | [z.ZodTypeAny, ...z.ZodTypeAny[]]>(args: IArguments, ...schemas: T) {
  return z.tuple(schemas).parse(args);
}
