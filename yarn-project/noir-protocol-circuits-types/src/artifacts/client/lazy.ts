import type { NoirCompiledCircuitWithName } from '@aztec/stdlib/noir';
import type { VerificationKeyData } from '@aztec/stdlib/vks';

import {
  ClientCircuitArtifactNames,
  getClientCircuitArtifact,
  getClientCircuitVkData,
} from '../../client_artifacts_helper.js';
import type { ArtifactProvider, ClientProtocolArtifact } from '../types.js';

export class LazyArtifactProvider implements ArtifactProvider {
  getClientCircuitArtifactByName(artifact: ClientProtocolArtifact): Promise<NoirCompiledCircuitWithName> {
    return getClientCircuitArtifact(ClientCircuitArtifactNames[artifact], false);
  }

  getSimulatedClientCircuitArtifactByName(artifact: ClientProtocolArtifact): Promise<NoirCompiledCircuitWithName> {
    return getClientCircuitArtifact(ClientCircuitArtifactNames[artifact], true);
  }

  getCircuitVkByName(artifact: ClientProtocolArtifact): Promise<VerificationKeyData> {
    return getClientCircuitVkData(ClientCircuitArtifactNames[artifact]);
  }
}
