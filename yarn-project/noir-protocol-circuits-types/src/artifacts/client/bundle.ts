import { type NoirCompiledCircuit } from '@aztec/types/noir';

import PrivateKernelInitJson from '../../../artifacts/private_kernel_init.json' assert { type: 'json' };
import PrivateKernelInitSimulatedJson from '../../../artifacts/private_kernel_init_simulated.json' assert { type: 'json' };
import PrivateKernelInnerJson from '../../../artifacts/private_kernel_inner.json' assert { type: 'json' };
import PrivateKernelInnerSimulatedJson from '../../../artifacts/private_kernel_inner_simulated.json' assert { type: 'json' };
import PrivateKernelTailJson from '../../../artifacts/private_kernel_tail.json' assert { type: 'json' };
import PrivateKernelTailSimulatedJson from '../../../artifacts/private_kernel_tail_simulated.json' assert { type: 'json' };
import PrivateKernelTailToPublicJson from '../../../artifacts/private_kernel_tail_to_public.json' assert { type: 'json' };
import PrivateKernelTailToPublicSimulatedJson from '../../../artifacts/private_kernel_tail_to_public_simulated.json' assert { type: 'json' };
import { PrivateKernelResetArtifacts, PrivateKernelResetSimulatedArtifacts } from '../../private_kernel_reset_data.js';
import { type ClientProtocolArtifact } from '../types.js';

export const ClientCircuitArtifacts: Record<ClientProtocolArtifact, NoirCompiledCircuit> = {
  PrivateKernelInitArtifact: PrivateKernelInitJson as NoirCompiledCircuit,
  PrivateKernelInnerArtifact: PrivateKernelInnerJson as NoirCompiledCircuit,
  PrivateKernelTailArtifact: PrivateKernelTailJson as NoirCompiledCircuit,
  PrivateKernelTailToPublicArtifact: PrivateKernelTailToPublicJson as NoirCompiledCircuit,
  ...PrivateKernelResetArtifacts,
};

export const SimulatedClientCircuitArtifacts: Record<ClientProtocolArtifact, NoirCompiledCircuit> = {
  PrivateKernelInitArtifact: PrivateKernelInitSimulatedJson as NoirCompiledCircuit,
  PrivateKernelInnerArtifact: PrivateKernelInnerSimulatedJson as NoirCompiledCircuit,
  PrivateKernelTailArtifact: PrivateKernelTailSimulatedJson as NoirCompiledCircuit,
  PrivateKernelTailToPublicArtifact: PrivateKernelTailToPublicSimulatedJson as NoirCompiledCircuit,
  ...PrivateKernelResetSimulatedArtifacts,
};
