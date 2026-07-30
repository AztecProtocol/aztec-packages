/* eslint-disable camelcase */
import { Fr } from '@aztec/foundation/curves/bn254';

import type { NoirCompiledContract } from '../noir/index.js';
import { getBenchmarkContractArtifact } from '../tests/fixtures.js';
import type { AbiValue } from './abi.js';
import { contractArtifactFromBuffer, contractArtifactToBuffer, loadContractArtifact } from './contract_artifact.js';

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
    const artifact = loadContractArtifact({
      name: 'TestContract',
      aztec_version: '1.0.0',
      transpiled: true,
      functions: [],
      outputs: {
        structs: {},
        globals: {
          storage: [
            {
              name: 'STORAGE_LAYOUT_TestContract',
              value: bareStorageLayout,
            },
          ],
        },
      },
      file_map: {},
    } satisfies NoirCompiledContract);

    expect(artifact.outputs.globals.storage[0]).toEqual({
      kind: 'struct',
      fields: expect.any(Array),
    });
    expect(artifact.storageLayout).toEqual({ balance: { slot: new Fr(1) } });
  });

  it('loads bare global values emitted by older Noir versions', () => {
    const artifact = loadContractArtifact({
      name: 'TestContract',
      aztec_version: '1.0.0',
      transpiled: true,
      functions: [],
      outputs: {
        structs: {},
        globals: {
          storage: [bareStorageLayout],
        },
      },
      file_map: {},
    } satisfies NoirCompiledContract);

    expect(artifact.outputs.globals.storage).toEqual([bareStorageLayout]);
    expect(artifact.storageLayout).toEqual({ balance: { slot: new Fr(1) } });
  });
});
