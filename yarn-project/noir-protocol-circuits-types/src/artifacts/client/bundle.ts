import type { NoirCompiledCircuit, NoirCompiledCircuitWithName } from '@aztec/stdlib/noir';
import type { VerificationKeyData } from '@aztec/stdlib/vks';

import HidingKernelToPublicJson from '../../../artifacts/hiding_kernel_to_public.json' with { type: 'json' };
import HidingKernelToRollupJson from '../../../artifacts/hiding_kernel_to_rollup.json' with { type: 'json' };
import PrivateKernelInitJson from '../../../artifacts/private_kernel_init.json' with { type: 'json' };
import PrivateKernelInit2Json from '../../../artifacts/private_kernel_init_2.json' with { type: 'json' };
import PrivateKernelInit3Json from '../../../artifacts/private_kernel_init_3.json' with { type: 'json' };
import PrivateKernelInitSimulatedJson from '../../../artifacts/private_kernel_init_simulated.json' with { type: 'json' };
import PrivateKernelInnerJson from '../../../artifacts/private_kernel_inner.json' with { type: 'json' };
import PrivateKernelInner2Json from '../../../artifacts/private_kernel_inner_2.json' with { type: 'json' };
import PrivateKernelInner3Json from '../../../artifacts/private_kernel_inner_3.json' with { type: 'json' };
import PrivateKernelInnerSimulatedJson from '../../../artifacts/private_kernel_inner_simulated.json' with { type: 'json' };
import {
  PrivateKernelResetArtifacts,
  PrivateKernelResetSimulatedArtifacts,
  PrivateKernelResetTailArtifacts,
  PrivateKernelResetTailSimulatedArtifacts,
  PrivateKernelResetTailToPublicArtifacts,
  PrivateKernelResetTailToPublicSimulatedArtifacts,
} from '../../private_kernel_reset_data.js';
import type { ArtifactProvider, ClientProtocolArtifact } from '../types.js';
import { ClientCircuitVks } from '../vks/client.js';

export const ClientCircuitArtifacts: Record<ClientProtocolArtifact, NoirCompiledCircuit> = {
  PrivateKernelInitArtifact: PrivateKernelInitJson as NoirCompiledCircuit,
  PrivateKernelInit2Artifact: PrivateKernelInit2Json as NoirCompiledCircuit,
  PrivateKernelInit3Artifact: PrivateKernelInit3Json as NoirCompiledCircuit,
  PrivateKernelInnerArtifact: PrivateKernelInnerJson as NoirCompiledCircuit,
  PrivateKernelInner2Artifact: PrivateKernelInner2Json as NoirCompiledCircuit,
  PrivateKernelInner3Artifact: PrivateKernelInner3Json as NoirCompiledCircuit,
  HidingKernelToRollup: HidingKernelToRollupJson as NoirCompiledCircuit,
  HidingKernelToPublic: HidingKernelToPublicJson as NoirCompiledCircuit,
  ...PrivateKernelResetArtifacts,
  ...PrivateKernelResetTailArtifacts,
  ...PrivateKernelResetTailToPublicArtifacts,
};

export const SimulatedClientCircuitArtifacts: Record<ClientProtocolArtifact, NoirCompiledCircuit> = {
  PrivateKernelInitArtifact: PrivateKernelInitSimulatedJson as NoirCompiledCircuit,
  // No private_kernel_init_2_simulated crate exists; reuse the constrained artifact for simulation.
  PrivateKernelInit2Artifact: PrivateKernelInit2Json as NoirCompiledCircuit,
  // No private_kernel_init_3_simulated crate exists; reuse the constrained artifact for simulation.
  PrivateKernelInit3Artifact: PrivateKernelInit3Json as NoirCompiledCircuit,
  PrivateKernelInnerArtifact: PrivateKernelInnerSimulatedJson as NoirCompiledCircuit,
  // No private_kernel_inner_2_simulated crate exists; reuse the constrained artifact for simulation.
  PrivateKernelInner2Artifact: PrivateKernelInner2Json as NoirCompiledCircuit,
  // No private_kernel_inner_3_simulated crate exists; reuse the constrained artifact for simulation.
  PrivateKernelInner3Artifact: PrivateKernelInner3Json as NoirCompiledCircuit,
  HidingKernelToRollup: HidingKernelToRollupJson as NoirCompiledCircuit,
  HidingKernelToPublic: HidingKernelToPublicJson as NoirCompiledCircuit,
  ...PrivateKernelResetSimulatedArtifacts,
  ...PrivateKernelResetTailSimulatedArtifacts,
  ...PrivateKernelResetTailToPublicSimulatedArtifacts,
};

export class BundleArtifactProvider implements ArtifactProvider {
  getClientCircuitArtifactByName(artifact: ClientProtocolArtifact): Promise<NoirCompiledCircuitWithName> {
    return Promise.resolve({ ...ClientCircuitArtifacts[artifact], name: artifact.replace('Artifact', '') });
  }

  getSimulatedClientCircuitArtifactByName(artifact: ClientProtocolArtifact): Promise<NoirCompiledCircuitWithName> {
    return Promise.resolve({ ...SimulatedClientCircuitArtifacts[artifact], name: artifact.replace('Artifact', '') });
  }

  getCircuitVkByName(artifact: ClientProtocolArtifact): Promise<VerificationKeyData> {
    return Promise.resolve(ClientCircuitVks[artifact]);
  }
}
