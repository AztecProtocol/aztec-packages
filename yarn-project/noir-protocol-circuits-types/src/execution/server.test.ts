import { Fr } from '@aztec/foundation/curves/bn254';
import { executeCircuit } from '@aztec/noir-acvm_js';
import { ParityPublicInputs } from '@aztec/stdlib/parity';
import { makeParityBasePrivateInputs } from '@aztec/stdlib/testing';

import { ServerCircuitArtifacts } from '../artifacts/server.js';
import { foreignCallHandler } from '../utils/server/foreign_call_handler.js';
import {
  convertParityBaseOutputsFromPublicInputFields,
  convertParityBaseOutputsFromWitnessMap,
  convertParityBasePrivateInputsToWitnessMap,
} from './server.js';

describe('convertOutputsFromPublicInputFields', () => {
  it('decodes ParityBase outputs from proof public input fields identically to the witness map decode', async () => {
    const inputs = makeParityBasePrivateInputs(/*seed=*/ 1);
    const inputWitness = convertParityBasePrivateInputsToWitnessMap(inputs);
    const bytecode = Buffer.from(ServerCircuitArtifacts.ParityBaseArtifact.bytecode, 'base64');
    const outputWitness = await executeCircuit(bytecode, inputWitness, foreignCallHandler);

    const expected = convertParityBaseOutputsFromWitnessMap(outputWitness);

    // bb returns the circuit's public inputs as an ordered field array: the return values (laid out right after the
    // parameter witnesses), possibly followed by recursion artifacts such as pairing points. Reconstruct that array
    // from the executed witness, including trailing non-return witnesses to check the decode ignores them.
    const numParameterWitnesses = inputWitness.size;
    const numReturnFields = ParityPublicInputs.getFields(expected).length;
    const publicInputFields: Uint8Array[] = [];
    for (let i = numParameterWitnesses; i < numParameterWitnesses + numReturnFields + 4; i++) {
      publicInputFields.push(new Uint8Array(Fr.fromString(outputWitness.get(i)!).toBuffer()));
    }

    expect(convertParityBaseOutputsFromPublicInputFields(publicInputFields)).toEqual(expected);
  });
});
