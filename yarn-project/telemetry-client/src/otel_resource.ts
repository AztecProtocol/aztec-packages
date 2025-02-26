import {
  type IResource,
  detectResourcesSync,
  envDetectorSync,
  osDetectorSync,
  processDetectorSync,
  serviceInstanceIdDetectorSync,
} from '@opentelemetry/resources';

import { aztecDetector } from './aztec_resource_detector.js';

export function getOtelResource(): IResource {
  const resource = detectResourcesSync({
    detectors: [osDetectorSync, envDetectorSync, processDetectorSync, serviceInstanceIdDetectorSync, aztecDetector],
  });

  return resource;
}
