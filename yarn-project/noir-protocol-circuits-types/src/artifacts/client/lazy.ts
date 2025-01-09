import { type NoirCompiledCircuit } from '@aztec/types/noir';

import { ClientCircuitArtifactNames, getClientCircuitArtifact } from '../../client_artifacts_helper.js';
import { ArtifactProvider, type ClientProtocolArtifact } from '../types.js';

export class LazyArtifactProvider implements ArtifactProvider {
  getClientCircuitArtifactByName(artifact: ClientProtocolArtifact): Promise<NoirCompiledCircuit> {
    return getClientCircuitArtifact(ClientCircuitArtifactNames[artifact], false);
  }

  getSimulatedClientCircuitArtifactByName(artifact: ClientProtocolArtifact): Promise<NoirCompiledCircuit> {
    return getClientCircuitArtifact(ClientCircuitArtifactNames[artifact], true);
  }
}
