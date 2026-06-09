import { getBenchmarkContractArtifact } from '../tests/fixtures.js';
import {
  contractArtifactFromBuffer,
  contractArtifactToBuffer,
  loadContractArtifactWithValidation,
} from './contract_artifact.js';

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
});
