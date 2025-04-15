import {
  type IResource,
  detectResourcesSync,
  envDetectorSync,
  osDetectorSync,
  processDetectorSync,
  serviceInstanceIdDetectorSync,
} from '@opentelemetry/resources';

export function getOtelResource(): IResource {
  const resource = detectResourcesSync({
    detectors: [osDetectorSync, envDetectorSync, processDetectorSync, serviceInstanceIdDetectorSync],
  });

  return resource;
}
