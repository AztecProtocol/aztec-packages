import { NoirCompiledCircuit } from '@aztec/noir-compiler';

import PrivateKernelInitJson from './target/private_kernel_init.json' assert { type: 'json' };
import PrivateKernelInnerJson from './target/private_kernel_inner.json' assert { type: 'json' };
import PrivateKernelOrderingJson from './target/private_kernel_ordering.json' assert { type: 'json' };

export const PrivateKernelInitArtifact = PrivateKernelInitJson as NoirCompiledCircuit;

export const PrivateKernelInnerArtifact = PrivateKernelInnerJson as NoirCompiledCircuit;

export const PrivateKernelOrderingArtifact = PrivateKernelOrderingJson as NoirCompiledCircuit;
