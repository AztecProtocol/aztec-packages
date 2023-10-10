import PrivateKernelInitJson from './target/private_kernel_init.json' assert { type: 'json' };
import PrivateKernelInnerJson from './target/private_kernel_inner.json' assert { type: 'json' };
import PrivateKernelOrderingJson from './target/private_kernel_ordering.json' assert { type: 'json' };

// TODO add types for noir circuit artifacts
export const PrivateKernelInitArtifact = PrivateKernelInitJson;

export const PrivateKernelInnerArtifact = PrivateKernelInnerJson;

export const PrivateKernelOrderingArtifact = PrivateKernelOrderingJson;
