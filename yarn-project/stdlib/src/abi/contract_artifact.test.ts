/* eslint-disable camelcase */
import { Fr } from '@aztec/foundation/curves/bn254';

import type { NoirCompiledContract } from '../noir/index.js';
import { getBenchmarkContractArtifact } from '../tests/fixtures.js';
import type { AbiValue } from './abi.js';
import {
  contractArtifactFromBuffer,
  contractArtifactToBuffer,
  loadContractArtifact,
  loadContractArtifactWithValidation,
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

  describe('loadContractArtifactWithValidation', () => {
    // The wire form of an already-processed artifact (hex/base64 strings) is what reaches the
    // loader from a JSON file, e.g. via the CLI deploy command.
    const wireForm = () => JSON.parse(contractArtifactToBuffer(getBenchmarkContractArtifact()).toString('utf-8'));

    it('accepts a valid already-processed artifact', () => {
      const loaded = loadContractArtifactWithValidation(wireForm());
      expect(loaded.name).toEqual(getBenchmarkContractArtifact().name);
    });

    it('rejects an artifact that passes the shallow shape check but violates the schema', () => {
      const input = wireForm();
      // functionType stays a string, so the shallow isContractArtifact() heuristic still passes,
      // but it is not a valid FunctionType enum value, so full schema validation must reject it.
      input.functions[0].functionType = 'not-a-real-type';
      expect(() => loadContractArtifactWithValidation(input)).toThrow();
    });
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
