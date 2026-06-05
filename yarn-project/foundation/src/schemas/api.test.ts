import { z } from 'zod';

import type { ApiSchemaFor } from './api.js';
import { optional } from './utils.js';

describe('ApiSchemaFor', () => {
  it('typechecks matching schemas', () => {
    interface TestApi {
      getCount(): Promise<number>;
      setName(name: string): Promise<void>;
      find(limit?: number): Promise<string[]>;
    }

    const schema: ApiSchemaFor<TestApi> = {
      getCount: z.function({ input: z.tuple([]), output: z.number() }),
      setName: z.function({ input: z.tuple([z.string()]), output: z.void() }),
      find: z.function({ input: z.tuple([optional(z.number())]), output: z.array(z.string()) }),
    };

    expect(Object.keys(schema)).toEqual(['getCount', 'setName', 'find']);
  });

  it('rejects schemas that do not match the interface', () => {
    interface TestApi {
      getCount(): Promise<number>;
      setName(name: string): Promise<void>;
      find(limit?: number): Promise<string[]>;
    }

    const _schemaWithWrongReturn: ApiSchemaFor<TestApi> = {
      // @ts-expect-error getCount must return a number.
      getCount: z.function({ input: z.tuple([]), output: z.string() }),
      setName: z.function({ input: z.tuple([z.string()]), output: z.void() }),
      find: z.function({ input: z.tuple([optional(z.number())]), output: z.array(z.string()) }),
    };

    const _schemaWithWrongParameter: ApiSchemaFor<TestApi> = {
      getCount: z.function({ input: z.tuple([]), output: z.number() }),
      // @ts-expect-error setName must accept a string.
      setName: z.function({ input: z.tuple([z.number()]), output: z.void() }),
      find: z.function({ input: z.tuple([optional(z.number())]), output: z.array(z.string()) }),
    };

    const _schemaWithRequiredOptionalParameter: ApiSchemaFor<TestApi> = {
      getCount: z.function({ input: z.tuple([]), output: z.number() }),
      setName: z.function({ input: z.tuple([z.string()]), output: z.void() }),
      // @ts-expect-error find's optional argument must accept nulls from JSON-RPC and output undefined.
      find: z.function({ input: z.tuple([z.number()]), output: z.array(z.string()) }),
    };

    expect(_schemaWithWrongReturn).toBeDefined();
    expect(_schemaWithWrongParameter).toBeDefined();
    expect(_schemaWithRequiredOptionalParameter).toBeDefined();
  });
});
