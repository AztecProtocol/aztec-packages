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

const storageLayoutValue = {
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
            value: {
              kind: 'struct',
              fields: [{ name: 'slot', value: { kind: 'integer', sign: false, value: '01' } }],
            },
          },
        ],
      },
    },
  ],
} satisfies AbiValue;

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

  it('reports the contract and function when a verification key has the wrong size', () => {
    const contract = contractWithGlobals({});
    contract.functions.push({
      name: 'deposit',
      is_unconstrained: false,
      custom_attributes: ['abi_private'],
      abi: { parameters: [], return_type: null, error_types: {} },
      bytecode: '',
      verification_key: Buffer.alloc(1).toString('base64'),
      debug_symbols: '',
    });

    expect(() => loadContractArtifact(contract)).toThrow(
      /TestContract::deposit.*verification key has wrong size: expected \d+, got 1.*rebuild.*current toolchain/i,
    );
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
    const fieldValue = { kind: 'integer', sign: false, value: '04d2' } satisfies AbiValue;
    const stringValue = { kind: 'string', value: 'exported' } satisfies AbiValue;

    it('returns an empty record for an unknown tag', () => {
      const artifact = loadContractArtifact(contractWithGlobals({}));
      expect(getGlobalsByTag(artifact, 'constants')).toEqual({});
    });

    it('handles global names that collide with Object prototype properties', () => {
      const artifact = loadContractArtifact(
        contractWithGlobals({ constants: [{ name: 'toString', value: fieldValue }] }),
      );
      expect(getGlobalsByTag(artifact, 'constants')).toEqual({ toString: fieldValue });
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
