import { type DetectorSync, type IResource, Resource } from '@opentelemetry/resources';
import { ATTR_K8S_POD_NAME, ATTR_K8S_POD_UID } from '@opentelemetry/semantic-conventions/incubating';

import { NETWORK_NAME } from './attributes.js';
import { getConfigEnvVars } from './config.js';

/**
 * Detector for custom Aztec attributes
 */
class AztecDetector implements DetectorSync {
  detect(): IResource {
    const config = getConfigEnvVars();

    return new Resource({
      [NETWORK_NAME]: config.networkName,
      [ATTR_K8S_POD_UID]: config.k8sPodUid,
      [ATTR_K8S_POD_NAME]: config.k8sPodName,
    });
  }
}

export const aztecDetector = new AztecDetector();
