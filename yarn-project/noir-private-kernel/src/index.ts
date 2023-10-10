import { KernelCircuitPublicInputs, PrivateKernelInputsInit } from '@aztec/circuits.js';
import { NoirCompiledCircuit } from '@aztec/noir-compiler';

import PrivateKernelInitJson from './target/private_kernel_init.json' assert { type: 'json' };
import PrivateKernelInnerJson from './target/private_kernel_inner.json' assert { type: 'json' };
import PrivateKernelOrderingJson from './target/private_kernel_ordering.json' assert { type: 'json' };
import { mapPrivateKernelInputsInitToNoir } from './type_conversion.js';
import { InputType as InitInputType } from './types/private_kernel_init_types.js';

export const PrivateKernelInitArtifact = PrivateKernelInitJson as NoirCompiledCircuit;

export const PrivateKernelInnerArtifact = PrivateKernelInnerJson as NoirCompiledCircuit;

export const PrivateKernelOrderingArtifact = PrivateKernelOrderingJson as NoirCompiledCircuit;

/**
 * Executes the init private kernel.
 * @param privateKernelInputsInit - The private kernel inputs.
 * @returns The public inputs.
 */
export function executeInit(privateKernelInputsInit: PrivateKernelInputsInit): Promise<KernelCircuitPublicInputs> {
  const _params: InitInputType = {
    input: mapPrivateKernelInputsInitToNoir(privateKernelInputsInit),
  };

  throw new Error('Not implemented');
}
