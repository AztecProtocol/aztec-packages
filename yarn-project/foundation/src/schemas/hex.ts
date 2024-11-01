import { type ZodType } from 'zod';

import { schemas } from './schemas.js';

export function hexSchemaFor<TClass extends { fromString(str: string): any }>(
  klazz: TClass,
): ZodType<TClass extends { fromString(str: string): infer TInstance } ? TInstance : never, any, string> {
  return schemas.Hex.transform(klazz.fromString);
}
