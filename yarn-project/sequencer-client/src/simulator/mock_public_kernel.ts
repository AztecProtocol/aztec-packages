import {
  PublicKernelInputsNoKernelInput,
  PublicKernelPublicInputs,
  PublicKernelInputsPrivateKernelInput,
  PublicKernelInputsNonFirstIteration,
} from '@aztec/circuits.js';
import { PublicKernelCircuitSimulator } from './index.js';

// TODO: Fill with mock values until we get the real circuit
export class MockPublicKernelCircuitSimulator implements PublicKernelCircuitSimulator {
  publicKernelCircuitNoInput(inputs: PublicKernelInputsNoKernelInput): Promise<PublicKernelPublicInputs> {
    throw new Error('Method not implemented.');
  }
  publicKernelCircuitPrivateInput(inputs: PublicKernelInputsPrivateKernelInput): Promise<PublicKernelPublicInputs> {
    throw new Error('Method not implemented.');
  }
  publicKernelCircuitNonFirstIteration(inputs: PublicKernelInputsNonFirstIteration): Promise<PublicKernelPublicInputs> {
    throw new Error('Method not implemented.');
  }
}
