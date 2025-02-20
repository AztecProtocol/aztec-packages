import type { NoirCompiledCircuit } from '@aztec/circuits.js/noir';

import { ClientCircuitArtifactNames, getClientCircuitArtifact } from '../../client_artifacts_helper.js';
import type { ArtifactProvider, ClientProtocolArtifact } from '../types.js';

export class LazyArtifactProvider implements ArtifactProvider {
  getClientCircuitArtifactByName(artifact: ClientProtocolArtifact): Promise<NoirCompiledCircuit> {
    return getClientCircuitArtifact(ClientCircuitArtifactNames[artifact], false);
  }

  getSimulatedClientCircuitArtifactByName(artifact: ClientProtocolArtifact): Promise<NoirCompiledCircuit> {
    return getClientCircuitArtifact(ClientCircuitArtifactNames[artifact], true);
  }
}
