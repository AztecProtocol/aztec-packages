import {
  type DetectorSync,
  type IResource,
  Resource,
  detectResourcesSync,
  envDetectorSync,
  osDetectorSync,
  serviceInstanceIdDetectorSync,
} from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

import { AZTEC_NODE_ROLE, AZTEC_REGISTRY_ADDRESS, AZTEC_ROLLUP_ADDRESS, AZTEC_ROLLUP_VERSION } from './attributes.js';

export function getOtelResource(): IResource {
  const resource = detectResourcesSync({
    detectors: [
      aztecNetworkDetectorSync,
      osDetectorSync,
      envDetectorSync,
      // this detector is disabled because:
      // 1. our software runs in a docker container, a lot of the attributes detected would be identical across different machines (e.g. all run node v22, executing the same script, running PID 1, etc)
      // 2. it catures process.argv which could contain sensitive values in plain text (e.g. validator private keys)
      // processDetectorSync,
      serviceInstanceIdDetectorSync,
    ],
  });

  return resource;
}

const aztecNetworkDetectorSync: DetectorSync = {
  detect(): IResource {
    let role: string | undefined;
    if (process.argv.includes('--sequencer')) {
      role = 'sequencer';
    } else if (process.argv.includes('--prover-node')) {
      role = 'prover-node';
    } else if (process.argv.includes('--node')) {
      role = 'node';
    }
    const aztecAttributes = {
      // this gets overwritten by OTEL_RESOURCE_ATTRIBUTES (if set)
      [SEMRESATTRS_SERVICE_NAME]: role ? `aztec-${role}` : undefined,
      [AZTEC_NODE_ROLE]: role,
      [AZTEC_ROLLUP_VERSION]: process.env.ROLLUP_VERSION ?? 'canonical',
      [AZTEC_ROLLUP_ADDRESS]: process.env.ROLLUP_CONTRACT_ADDRESS,
      [AZTEC_REGISTRY_ADDRESS]: process.env.REGISTRY_CONTRACT_ADDRESS,
    };

    return new Resource(aztecAttributes);
  },
};
