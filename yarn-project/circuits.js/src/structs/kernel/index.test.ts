import { expectSerializeToMatchSnapshot } from '../../tests/expectSerialize.js';
import {
  makeAccumulatedData,
  makeFinalAccumulatedData,
  makePreviousPrivateKernelData,
  makePreviousPublicKernelData,
  makePrivateKernelInputsInit,
  makePrivateKernelInputsInner,
  makePrivateKernelPublicInputs,
  makePrivateKernelPublicInputsFinal,
  makePublicKernelInputsInit,
  makePublicKernelInputsInner,
  makePublicKernelPublicInputs,
  makeSchnorrSignature,
} from '../../tests/factories.js';

describe('structs/kernel', () => {
  it(`serializes and prints previous_private_kernel_data`, async () => {
    const previousKernelData = makePreviousPrivateKernelData();
    await expectSerializeToMatchSnapshot(
      previousKernelData.toBuffer(),
      'abis__test_roundtrip_serialize_previous_private_kernel_data',
    );
  });

  it(`serializes and prints previous_public_kernel_data`, async () => {
    const previousKernelData = makePreviousPublicKernelData();
    await expectSerializeToMatchSnapshot(
      previousKernelData.toBuffer(),
      'abis__test_roundtrip_serialize_previous_public_kernel_data',
    );
  });

  it(`serializes and prints private_kernel_inputs_init`, async () => {
    const kernelInputs = makePrivateKernelInputsInit();
    await expectSerializeToMatchSnapshot(
      kernelInputs.toBuffer(),
      'abis__test_roundtrip_serialize_private_kernel_inputs_init',
    );
  });

  it(`serializes and prints private_kernel_inputs_inner`, async () => {
    const kernelInputs = makePrivateKernelInputsInner();
    await expectSerializeToMatchSnapshot(
      kernelInputs.toBuffer(),
      'abis__test_roundtrip_serialize_private_kernel_inputs_inner',
    );
  });

  it(`serializes and prints EcdsaSignature`, async () => {
    await expectSerializeToMatchSnapshot(makeSchnorrSignature().toBuffer(), 'abis__test_roundtrip_serialize_signature');
  });

  it(`serializes and prints CombinedAccumulatedData`, async (seed = 1) => {
    await expectSerializeToMatchSnapshot(
      makeAccumulatedData(seed, true).toBuffer(),
      'abis__test_roundtrip_serialize_combined_accumulated_data',
    );
  });

  it(`serializes and prints FinalAccumulatedData`, async (seed = 1) => {
    await expectSerializeToMatchSnapshot(
      makeFinalAccumulatedData(seed, true).toBuffer(),
      'abis__test_roundtrip_serialize_final_accumulated_data',
    );
  });

  it(`serializes and prints private_kernel_public_inputs`, async () => {
    const kernelInputs = makePrivateKernelPublicInputs();
    await expectSerializeToMatchSnapshot(
      kernelInputs.toBuffer(),
      'abis__test_roundtrip_serialize_private_kernel_circuit_public_inputs',
    );
  });

  it(`serializes and prints private_kernel_public_inputs for ordering circuit`, async () => {
    const kernelInputs = makePrivateKernelPublicInputsFinal();
    await expectSerializeToMatchSnapshot(
      kernelInputs.toBuffer(),
      'abis__test_roundtrip_serialize_private_kernel_circuit_public_inputs_final',
    );
  });

  it(`serializes and prints public_kernel_public_inputs`, async () => {
    const kernelInputs = makePublicKernelPublicInputs();
    await expectSerializeToMatchSnapshot(
      kernelInputs.toBuffer(),
      'abis__test_roundtrip_serialize_public_kernel_circuit_public_inputs',
    );
  });

  it(`serializes and prints public_kernel_inputs_init`, async () => {
    const kernelInputs = await makePublicKernelInputsInit();
    await expectSerializeToMatchSnapshot(
      kernelInputs.toBuffer(),
      'abis__test_roundtrip_serialize_public_kernel_inputs_init',
    );
  });

  it(`serializes and prints public_kernel_inputs_inner`, async () => {
    const kernelInputs = await makePublicKernelInputsInner();
    await expectSerializeToMatchSnapshot(
      kernelInputs.toBuffer(),
      'abis__test_roundtrip_serialize_public_kernel_inputs_inner',
    );
  });
});
