/* eslint-disable camelcase */
import { Fr } from '@aztec/foundation/curves/bn254';
import { type AbiNamedValue, type AbiValue, emptyContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import { generateTypescriptContractInterface } from './typescript.js';

function integer(value: number): AbiValue {
  return { kind: 'integer', sign: value < 0, value: Math.abs(value).toString(16) };
}

function contractWithGlobals(globals: Record<string, AbiNamedValue[]>): NoirCompiledContract {
  return {
    name: 'TestContract',
    aztec_version: '1.0.0',
    transpiled: true,
    functions: [],
    outputs: { structs: {}, globals },
    file_map: {},
  };
}

async function generateGlobals(globals: Record<string, AbiNamedValue[]>): Promise<Record<string, any> | undefined> {
  const generated = await generateTypescriptContractInterface(
    loadContractArtifact(contractWithGlobals(globals)),
    './TestContract.json',
  );
  const match = generated.match(/public static get globals\(\) \{\s*return (\{[\s\S]*\}) as const;/);
  if (!match) {
    return undefined;
  }
  // Evaluate the emitted literal so the assertions cover its runtime semantics, not just its text.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(`return ${match[1]}`)() as Record<string, any>;
}

// Built from a `ContractArtifact` directly: the storage getter renders `artifact.storageLayout`, so the layout is
// the unit boundary here and artifact loading is covered by the stdlib tests.
async function generateStorage(fields: Record<string, number>): Promise<Record<string, any>> {
  const generated = await generateTypescriptContractInterface(
    {
      ...emptyContractArtifact(),
      name: 'TestContract',
      storageLayout: Object.fromEntries(Object.entries(fields).map(([name, slot]) => [name, { slot: new Fr(slot) }])),
    },
    './TestContract.json',
  );
  const match = generated.match(
    /public static get storage\(\)[^{]*\{\s*return (\{[\s\S]*?\}) as ContractStorageLayout/,
  );
  // Evaluate the emitted literal so the assertions cover its runtime semantics, not just its text.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function('Fr', `return ${match![1]}`)(function (value: bigint) {
    return { value };
  }) as Record<string, any>;
}

describe('generateTypescriptContractInterface storage', () => {
  it('defines a storage field named __proto__ as a regular own property', async () => {
    const storage = await generateStorage({ ['__proto__']: 1, balance: 2 });
    expect(Object.getOwnPropertyDescriptor(storage, '__proto__')?.value.slot.value).toBe(1n);
    expect(Object.getPrototypeOf(storage)).toBe(Object.prototype);
    expect(Object.keys(storage)).toEqual(['__proto__', 'balance']);
  });
});

describe('generateTypescriptContractInterface globals', () => {
  it('decodes every AbiValue kind into a plain typescript value, grouped by tag', async () => {
    const globals = await generateGlobals({
      constants: [
        { name: 'FIELD_CONSTANT', value: integer(1234) },
        { name: 'NEGATIVE_CONSTANT', value: integer(-5) },
        { name: 'STRING_CONSTANT', value: { kind: 'string', value: 'exported' } },
        { name: 'BOOLEAN_CONSTANT', value: { kind: 'boolean', value: true } },
        { name: 'ARRAY_CONSTANT', value: { kind: 'array', value: [integer(1), integer(2)] } },
        { name: 'TUPLE_CONSTANT', value: { kind: 'tuple', fields: [integer(3), { kind: 'string', value: 'two' }] } },
        {
          name: 'STRUCT_CONSTANT',
          value: {
            kind: 'struct',
            fields: [
              { name: 'inner', value: integer(7) },
              { name: 'nested', value: { kind: 'struct', fields: [{ name: 'flag', value: integer(0) }] } },
            ],
          },
        },
        // Also present under `limits`: stacking #[abi(constants)] and #[abi(limits)] on one global
        // exports the same name under both tags.
        { name: 'MAX_ENTRIES', value: { kind: 'string', value: 'unlimited' } },
      ],
      limits: [{ name: 'MAX_ENTRIES', value: integer(100) }],
    });

    expect(globals).toEqual({
      constants: {
        FIELD_CONSTANT: 1234n,
        NEGATIVE_CONSTANT: -5n,
        STRING_CONSTANT: 'exported',
        BOOLEAN_CONSTANT: true,
        ARRAY_CONSTANT: [1n, 2n],
        TUPLE_CONSTANT: [3n, 'two'],
        STRUCT_CONSTANT: { inner: 7n, nested: { flag: 0n } },
        MAX_ENTRIES: 'unlimited',
      },
      limits: {
        MAX_ENTRIES: 100n,
      },
    });
  });

  it('defines a global named __proto__ as a regular own property', async () => {
    const globals = await generateGlobals({ constants: [{ name: '__proto__', value: integer(1) }] });
    expect(Object.getOwnPropertyDescriptor(globals!.constants, '__proto__')?.value).toBe(1n);
    expect(Object.getPrototypeOf(globals!.constants)).toBe(Object.prototype);
  });

  it('quotes ABI tags that are not valid typescript identifiers', async () => {
    const globals = await generateGlobals({ '123': [{ name: 'MY_GLOBAL', value: integer(1) }] });
    expect(globals).toEqual({ '123': { MY_GLOBAL: 1n } });
  });

  it('defines a tag named __proto__ as a regular own property', async () => {
    // `fromEntries` creates an own `__proto__` key, matching what `JSON.parse` of a compiled artifact produces.
    const globals = await generateGlobals(
      Object.fromEntries([['__proto__', [{ name: 'MY_GLOBAL', value: integer(1) }]]]) as Record<
        string,
        AbiNamedValue[]
      >,
    );
    expect(Object.getOwnPropertyDescriptor(globals, '__proto__')?.value).toEqual({ MY_GLOBAL: 1n });
    expect(Object.getPrototypeOf(globals)).toBe(Object.prototype);
  });

  it('emits no globals getter when the contract only exports the storage layout', async () => {
    const storageLayoutValue: AbiValue = {
      kind: 'struct',
      fields: [
        { name: 'contract_name', value: { kind: 'string', value: 'TestContract' } },
        {
          name: 'fields',
          value: {
            kind: 'struct',
            fields: [
              {
                name: 'balance',
                value: { kind: 'struct', fields: [{ name: 'slot', value: integer(1) }] },
              },
            ],
          },
        },
      ],
    };
    const globals = await generateGlobals({
      storage: [{ name: 'STORAGE_LAYOUT_TestContract', value: storageLayoutValue }],
    });
    expect(globals).toBeUndefined();
  });
});
