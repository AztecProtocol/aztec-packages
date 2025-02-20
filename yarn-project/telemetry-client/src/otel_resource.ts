import { GcpDetectorSync } from '@google-cloud/opentelemetry-resource-util';
import {
  detectResourcesSync,
  envDetectorSync,
  osDetectorSync,
  processDetectorSync,
  serviceInstanceIdDetectorSync,
} from '@opentelemetry/resources';
import type { IResource } from '@opentelemetry/resources';

import { aztecDetector } from './aztec_resource_detector.js';

export function getOtelResource(): IResource {
  const resource = detectResourcesSync({
    detectors: [
      osDetectorSync,
      envDetectorSync,
      processDetectorSync,
      serviceInstanceIdDetectorSync,
      aztecDetector,
      new GcpDetectorSync(),
    ],
  });

  return resource;
}
