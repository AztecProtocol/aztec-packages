/* eslint-disable camelcase */
import { Fr } from '@aztec/foundation/curves/bn254';

import { computeArtifactHash } from '../contract/artifact_hash.js';
import type { NoirCompiledContract } from '../noir/index.js';
import { getBenchmarkContractArtifact, getTestContractArtifact } from '../tests/fixtures.js';
import type { AbiNamedValue, AbiValue } from './abi.js';
import {
  contractArtifactFromBuffer,
  contractArtifactToBuffer,
  getNamedContractGlobals,
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

  it('keeps the artifact hash stable', async () => {
    // The artifact hash commits to `outputs` as stringified JSON, so any change to the loaded shape of globals
    // moves the class ID (and thus address) of every contract. This pin makes such a change an explicit,
    // reviewed decision rather than an accident.
    const artifact = loadContractArtifact(
      contractWithGlobals({ storage: [{ name: 'STORAGE_LAYOUT_TestContract', value: storageLayoutValue }] }),
    );
    const hash = await computeArtifactHash(artifact);
    expect(hash.toString()).toBe('0x1e30b5c2e546947326430ce5dd486679d8172220a932822374bdce0fda15232d');
  });

  it('loads the constants exported by the Test contract', () => {
    const artifact = getTestContractArtifact();
    const constants = getNamedContractGlobals(artifact, 'constants');
    expect(constants.EXPORTED_FIELD_CONSTANT).toEqual({
      kind: 'integer',
      sign: false,
      value: '00000000000000000000000000000000000000000000000000000000000004d2',
    });
    expect(constants.EXPORTED_STRING_CONSTANT).toEqual({ kind: 'string', value: 'exported' });
  });

  describe('getNamedContractGlobals', () => {
    const fieldValue = { kind: 'integer', sign: false, value: '04d2' } satisfies AbiValue;
    const stringValue = { kind: 'string', value: 'exported' } satisfies AbiValue;

    it('returns globals keyed by name', () => {
      const artifact = loadContractArtifact(
        contractWithGlobals({
          constants: [
            { name: 'MY_FIELD', value: fieldValue },
            { name: 'MY_STRING', value: stringValue },
          ],
        }),
      );
      expect(getNamedContractGlobals(artifact, 'constants')).toEqual({ MY_FIELD: fieldValue, MY_STRING: stringValue });
    });

    it('returns an empty record for an unknown tag', () => {
      const artifact = loadContractArtifact(contractWithGlobals({}));
      expect(getNamedContractGlobals(artifact, 'constants')).toEqual({});
    });

    it('handles global names that collide with Object prototype properties', () => {
      const artifact = loadContractArtifact(
        contractWithGlobals({ constants: [{ name: 'toString', value: fieldValue }] }),
      );
      expect(getNamedContractGlobals(artifact, 'constants')).toEqual({ toString: fieldValue });
    });

    it('throws on duplicate names under the same tag', () => {
      const artifact = loadContractArtifact(
        contractWithGlobals({
          constants: [
            { name: 'MY_FIELD', value: fieldValue },
            { name: 'MY_FIELD', value: stringValue },
          ],
        }),
      );
      expect(() => getNamedContractGlobals(artifact, 'constants')).toThrow(/Duplicate global 'MY_FIELD'/);
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
