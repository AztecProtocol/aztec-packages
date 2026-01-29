import {
  type DetectorSync,
  type IResource,
  Resource,
  detectResourcesSync,
  envDetectorSync,
  osDetectorSync,
  serviceInstanceIdDetectorSync,
} from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { AZTEC_NODE_ROLE, AZTEC_REGISTRY_ADDRESS, AZTEC_ROLLUP_ADDRESS, AZTEC_ROLLUP_VERSION } from './attributes.js';

/** Reads the Aztec client version from the release manifest. */
function getAztecVersion(): string | undefined {
  try {
    const releasePleasePath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../.release-please-manifest.json',
    );
    return JSON.parse(readFileSync(releasePleasePath, 'utf-8'))['.'];
  } catch {
    return undefined;
  }
}

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
    } else if (process.argv.includes('--p2p-bootstrap')) {
      role = 'bootnode';
    }
    const aztecAttributes = {
      // this gets overwritten by OTEL_RESOURCE_ATTRIBUTES (if set)
      [ATTR_SERVICE_NAME]: role ? `aztec-${role}` : undefined,
      [ATTR_SERVICE_VERSION]: getAztecVersion(),
      [AZTEC_NODE_ROLE]: role,
      [AZTEC_ROLLUP_VERSION]: process.env.ROLLUP_VERSION ?? 'canonical',
      [AZTEC_ROLLUP_ADDRESS]: process.env.ROLLUP_CONTRACT_ADDRESS,
      [AZTEC_REGISTRY_ADDRESS]: process.env.REGISTRY_CONTRACT_ADDRESS,
    };

    return new Resource(aztecAttributes);
  },
};
