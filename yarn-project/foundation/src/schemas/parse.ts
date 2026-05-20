import { z } from 'zod';

import { times } from '../collection/array.js';

/** Parses the given arguments using a tuple from the provided schemas. */
export function parse<T extends [] | [z.ZodTypeAny, ...z.ZodTypeAny[]]>(args: IArguments, ...schemas: T) {
  return schemas.length === 0
    ? z.tuple([]).parse(args)
    : z.tuple(schemas as [z.ZodTypeAny, ...z.ZodTypeAny[]]).parse(args);
}

/**
 * Parses the given arguments against a tuple, allowing empty for optional items.
 * @dev Zod doesn't like tuples with optional items. See https://github.com/colinhacks/zod/discussions/949.
 */
export function parseWithOptionals<T extends z.ZodTuple<any, any>>(args: any[], schema: T): Promise<z.output<T>> {
  const items = schema.def.items;
  const missingCount = items.length - args.length;
  const optionalCount = items.filter(isOptional).length;
  const toParse =
    missingCount > 0 && missingCount <= optionalCount ? args.concat(times(missingCount, () => undefined)) : args;
  return schema.parseAsync(toParse);
}

function isOptional(schema: z.ZodTypeAny) {
  try {
    return schema.isOptional();
  } catch {
    // See https://github.com/colinhacks/zod/issues/1911
    return schema.def.type === 'optional';
  }
}
