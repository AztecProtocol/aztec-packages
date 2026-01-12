import type { MetricOptions } from '@opentelemetry/api';

import type { MetricDefinition } from './metrics.js';

/** Extracts OpenTelemetry MetricOptions from a MetricDefinition */
export function toMetricOptions(def: MetricDefinition): MetricOptions {
  return {
    description: def.description,
    unit: def.unit,
    valueType: def.valueType,
  };
}
