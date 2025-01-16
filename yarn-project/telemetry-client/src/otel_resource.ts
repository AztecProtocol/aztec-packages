import { GcpDetectorSync } from '@google-cloud/opentelemetry-resource-util';
import {
  type IResource,
  detectResourcesSync,
  envDetectorSync,
  osDetectorSync,
  processDetectorSync,
  serviceInstanceIdDetectorSync,
} from '@opentelemetry/resources';

import { aztecDetector } from './aztec_resource_detector.js';

export async function getOtelResource(): Promise<IResource> {
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

  if (resource.asyncAttributesPending) {
    await resource.waitForAsyncAttributes!();
  }

  return resource;
}
