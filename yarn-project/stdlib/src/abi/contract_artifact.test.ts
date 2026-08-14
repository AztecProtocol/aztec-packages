/* eslint-disable camelcase */
import { Fr } from '@aztec/foundation/curves/bn254';

import type { NoirCompiledContract } from '../noir/index.js';
import { getBenchmarkContractArtifact, getTestContractArtifact } from '../tests/fixtures.js';
import type { AbiNamedValue, AbiValue } from './abi.js';
import {
  contractArtifactFromBuffer,
  contractArtifactToBuffer,
  getGlobalsByTag,
  loadContractArtifact,
} from './contract_artifact.js';

function storageLayoutFor(contractName: string, fields: [name: string, slot: string][]): AbiValue {
  return {
    kind: 'struct',
    fields: [
      { name: 'contract_name', value: { kind: 'string', value: contractName } },
      {
        name: 'fields',
        value: {
          kind: 'struct',
          fields: fields.map(([name, slot]) => ({
            name,
            value: {
              kind: 'struct',
              fields: [{ name: 'slot', value: { kind: 'integer', sign: false, value: slot } }],
            },
          })),
        },
      },
    ],
  };
}

const storageLayoutValue = storageLayoutFor('TestContract', [['balance', '01']]);

const fieldValue = { kind: 'integer', sign: false, value: '04d2' } satisfies AbiValue;
const stringValue = { kind: 'string', value: 'exported' } satisfies AbiValue;

describe('contract_artifact', () => {
  it('serializes and deserializes an instance', () => {
    const artifact = getBenchmarkContractArtifact();
    const serialized = contractArtifactToBuffer(artifact);
    const deserialized = contractArtifactFromBuffer(serialized);
    expect(deserialized).toEqual(artifact);
  });

  it('loads named global values emitted by Noir', () => {
    const artifact = loadContractArtifact(
      contractWithGlobals({ storage: [{ name: 'STORAGE_LAYOUT_TestContract', value: storageLayoutValue }] }),
    );

    expect(artifact.outputs.globals.storage[0]).toEqual({
      name: 'STORAGE_LAYOUT_TestContract',
      value: storageLayoutValue,
    });
    expect(artifact.storageLayout).toEqual({ balance: { slot: new Fr(1) } });
  });

  it('preserves a global exported under a tag named __proto__', () => {
    // `fromEntries` creates an own `__proto__` key, matching what `JSON.parse` of a compiled artifact produces;
    // an object literal would set the prototype instead of defining the key.
    const globals = Object.fromEntries([['__proto__', [{ name: 'MY_GLOBAL', value: fieldValue }]]]) as Record<
      string,
      AbiNamedValue[]
    >;
    const artifact = loadContractArtifact(contractWithGlobals(globals));

    expect(Object.keys(artifact.outputs.globals)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(artifact.outputs.globals)).toBe(Object.prototype);
    expect(getGlobalsByTag(artifact, '__proto__')).toEqual({ MY_GLOBAL: fieldValue });
  });

  it('loads a storage layout field named __proto__ as a regular own property', () => {
    const artifact = loadContractArtifact(
      contractWithGlobals({
        storage: [
          {
            name: 'STORAGE_LAYOUT_TestContract',
            value: storageLayoutFor('TestContract', [
              ['__proto__', '01'],
              ['balance', '02'],
            ]),
          },
        ],
      }),
    );

    expect(Object.keys(artifact.storageLayout)).toEqual(['__proto__', 'balance']);
    expect(Object.getOwnPropertyDescriptor(artifact.storageLayout, '__proto__')?.value).toEqual({ slot: new Fr(1) });
    expect(Object.getPrototypeOf(artifact.storageLayout)).toBe(Object.prototype);
  });

  it('selects the layout matching the contract name over an imported contract layout', () => {
    const artifact = loadContractArtifact(
      contractWithGlobals({
        storage: [
          { name: 'STORAGE_LAYOUT_OtherContract', value: storageLayoutFor('OtherContract', [['dep_balance', '63']]) },
          { name: 'STORAGE_LAYOUT_TestContract', value: storageLayoutValue },
        ],
      }),
    );
    expect(artifact.storageLayout).toEqual({ balance: { slot: new Fr(1) } });
  });

  it('throws when two storage layouts declare the same contract name', () => {
    // Reachable from valid Noir: a dependency contract sharing this contract's unqualified name emits an
    // identically named layout global with an identical contract_name, and the compiler exports both.
    expect(() =>
      loadContractArtifact(
        contractWithGlobals({
          storage: [
            {
              name: 'STORAGE_LAYOUT_TestContract',
              value: storageLayoutFor('TestContract', [['dep_balance', '63']]),
            },
            { name: 'STORAGE_LAYOUT_TestContract', value: storageLayoutValue },
          ],
        }),
      ),
    ).toThrow(/Ambiguous storage layout/);
  });

  it('rejects a global exported under the reserved storage tag', () => {
    // Reachable from valid Noir: `#[abi(storage)]` on a user global compiles, and the entry lands next to the
    // layout the storage macro generates.
    expect(() =>
      loadContractArtifact(
        contractWithGlobals({
          storage: [
            {
              name: 'MY_GLOBAL',
              value: { kind: 'struct', fields: [{ name: 'x', value: { kind: 'integer', sign: false, value: '2a' } }] },
            },
            { name: 'STORAGE_LAYOUT_TestContract', value: storageLayoutValue },
          ],
        }),
      ),
    ).toThrow(/Global 'MY_GLOBAL'.*reserved/);
  });

  it('loads the constants exported by the Test contract', () => {
    const artifact = getTestContractArtifact();
    const constants = getGlobalsByTag(artifact, 'constants');
    expect(constants.EXPORTED_FIELD_CONSTANT).toEqual({
      kind: 'integer',
      sign: false,
      value: '00000000000000000000000000000000000000000000000000000000000004d2',
    });
    expect(constants.EXPORTED_STRING_CONSTANT).toEqual({ kind: 'string', value: 'exported' });

    const limits = getGlobalsByTag(artifact, 'limits');
    expect(limits.EXPORTED_LIMIT_CONSTANT).toEqual({
      kind: 'integer',
      sign: false,
      value: '0000000000000000000000000000000000000000000000000000000000000064',
    });
    expect(constants.EXPORTED_LIMIT_CONSTANT).toBeUndefined();
    expect(limits.EXPORTED_FIELD_CONSTANT).toBeUndefined();

    // EXPORTED_SHARED_CONSTANT stacks #[abi(constants)] and #[abi(limits)], exporting it under both tags.
    expect(constants.EXPORTED_SHARED_CONSTANT).toEqual({
      kind: 'integer',
      sign: false,
      value: '0000000000000000000000000000000000000000000000000000000000000007',
    });
    expect(limits.EXPORTED_SHARED_CONSTANT).toEqual(constants.EXPORTED_SHARED_CONSTANT);
  });

  describe('getGlobalsByTag', () => {
    it('returns an empty record for an unknown tag', () => {
      const artifact = loadContractArtifact(contractWithGlobals({}));
      expect(getGlobalsByTag(artifact, 'constants')).toEqual({});
    });

    it.each(Object.getOwnPropertyNames(Object.prototype))(
      'returns an empty record for the absent tag %s inherited from Object.prototype',
      tag => {
        const artifact = loadContractArtifact(
          contractWithGlobals({ constants: [{ name: 'MY_FIELD', value: fieldValue }] }),
        );
        expect(getGlobalsByTag(artifact, tag)).toEqual({});
      },
    );

    it('handles global names that collide with Object prototype properties', () => {
      const artifact = loadContractArtifact(
        contractWithGlobals({ constants: [{ name: 'toString', value: fieldValue }] }),
      );
      expect(getGlobalsByTag(artifact, 'constants')).toEqual({ toString: fieldValue });
    });

    it('reports a pre-cutover artifact when its globals carry no names', () => {
      // Pre-cutover artifacts exported bare values without names. Already-processed artifacts are returned by
      // `loadContractArtifact` without validation, so the stale shape must surface an accurate error at read time.
      const artifact = {
        ...loadContractArtifact(contractWithGlobals({})),
        outputs: { structs: {}, globals: { constants: [fieldValue] } },
      } as unknown as Parameters<typeof getGlobalsByTag>[0];
      expect(() => getGlobalsByTag(artifact, 'constants')).toThrow(/predates named globals/);
    });

    it('throws on duplicate names under the same tag', () => {
      // Reachable from valid Noir: repeating the same #[abi(tag)] attribute on one global emits the
      // entry once per attribute, without deduplication.
      const artifact = loadContractArtifact(
        contractWithGlobals({
          constants: [
            { name: 'MY_FIELD', value: fieldValue },
            { name: 'MY_FIELD', value: stringValue },
          ],
        }),
      );
      expect(() => getGlobalsByTag(artifact, 'constants')).toThrow(/Duplicate global 'MY_FIELD'/);
    });
  });
});

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
