import { awsEc2Detector, awsEcsDetector } from '@opentelemetry/resource-detector-aws';
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
  // TODO(palla/log): Do we really need *all* this info?
  const resource = detectResourcesSync({
    detectors: [
      osDetectorSync,
      envDetectorSync,
      processDetectorSync,
      serviceInstanceIdDetectorSync,
      awsEc2Detector,
      awsEcsDetector,
      aztecDetector,
    ],
  });

  if (resource.asyncAttributesPending) {
    await resource.waitForAsyncAttributes!();
  }

  return resource;
}
