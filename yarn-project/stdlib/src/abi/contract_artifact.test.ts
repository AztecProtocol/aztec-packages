/* eslint-disable camelcase */
import { Fr } from '@aztec/foundation/curves/bn254';

import { computeArtifactHash } from '../contract/artifact_hash.js';
import type { NoirCompiledContract } from '../noir/index.js';
import { getBenchmarkContractArtifact, getTestContractArtifact } from '../tests/fixtures.js';
import type { AbiGlobalValue, AbiValue } from './abi.js';
import {
  contractArtifactFromBuffer,
  contractArtifactToBuffer,
  getNamedContractGlobals,
  loadContractArtifact,
} from './contract_artifact.js';

const bareStorageLayout = {
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
      contractWithGlobals({ storage: [{ name: 'STORAGE_LAYOUT_TestContract', value: bareStorageLayout }] }),
    );

    expect(artifact.outputs.globals.storage[0]).toEqual({
      name: 'STORAGE_LAYOUT_TestContract',
      value: bareStorageLayout,
    });
    expect(artifact.storageLayout).toEqual({ balance: { slot: new Fr(1) } });
  });

  it('loads bare global values emitted by older Noir versions', () => {
    const artifact = loadContractArtifact(contractWithGlobals({ storage: [bareStorageLayout] }));

    expect(artifact.outputs.globals.storage).toEqual([bareStorageLayout]);
    expect(artifact.storageLayout).toEqual({ balance: { slot: new Fr(1) } });
  });

  it('keeps the artifact hash of bare-globals artifacts stable', async () => {
    // Guards the passthrough property that protects the standard-contract pin: artifacts compiled before Noir
    // exported global names must keep hashing exactly as they did when the loader stripped names. The expected
    // value was computed on a commit predating name preservation.
    const artifact = loadContractArtifact(contractWithGlobals({ storage: [bareStorageLayout] }));
    const hash = await computeArtifactHash(artifact);
    expect(hash.toString()).toBe('0x1e6663776c77059473f80a3bae00da46827de913e81129e903cedae49224fe73');
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

    it('returns named globals by name and omits bare legacy values', () => {
      const artifact = loadContractArtifact(
        contractWithGlobals({
          constants: [{ name: 'MY_FIELD', value: fieldValue }, { name: 'MY_STRING', value: stringValue }, fieldValue],
        }),
      );
      expect(getNamedContractGlobals(artifact, 'constants')).toEqual({ MY_FIELD: fieldValue, MY_STRING: stringValue });
    });

    it('returns an empty record for an unknown tag', () => {
      const artifact = loadContractArtifact(contractWithGlobals({}));
      expect(getNamedContractGlobals(artifact, 'constants')).toEqual({});
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

function contractWithGlobals(globals: Record<string, AbiGlobalValue[]>): NoirCompiledContract {
  return {
    name: 'TestContract',
    aztec_version: '1.0.0',
    transpiled: true,
    functions: [],
    outputs: { structs: {}, globals },
    file_map: {},
  };
}
