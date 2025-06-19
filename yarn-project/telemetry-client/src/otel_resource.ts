import {
  type DetectorSync,
  type IResource,
  Resource,
  detectResourcesSync,
  envDetectorSync,
  osDetectorSync,
  processDetectorSync,
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
      processDetectorSync,
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
