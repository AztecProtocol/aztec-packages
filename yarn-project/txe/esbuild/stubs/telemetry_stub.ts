/* eslint-disable no-restricted-imports, import-x/no-relative-packages */
// eslint-disable-next-line import-x/no-extraneous-dependencies
import { ValueType } from '@opentelemetry/api';

import { noop } from './stub_helpers.js';

export * from '../../../telemetry-client/dest/telemetry.js';
export * from '../../../telemetry-client/dest/noop.js';
export * from '../../../telemetry-client/dest/with_tracer.js';
export * from '../../../telemetry-client/dest/start.js';
export * from '../../../telemetry-client/dest/otel_propagation.js';
export * from '../../../telemetry-client/dest/prom_otel_adapter.js';
export * from '../../../telemetry-client/dest/wrappers/fetch.js';
export * from '../../../telemetry-client/dest/wrappers/l2_block_stream.js';

type MetricDefinition = { name: string; description: string; valueType: ValueType };

export class LmdbMetrics {
  constructor(..._args: unknown[]) {}
  recordDBMetrics = noop;
  start = noop;
  stop = noop;
}

function makeMetricDefinition(prop: string): MetricDefinition {
  return {
    name: `aztec.stub.${prop.toLowerCase()}`,
    description: 'TXE stub metric',
    valueType: ValueType.INT,
  };
}

export const Metrics: Record<string, MetricDefinition> = new Proxy(Object.create(null), {
  get: (_target, prop) => (typeof prop === 'string' ? makeMetricDefinition(prop) : undefined),
});

export const Attributes: Record<string, string> = new Proxy(Object.create(null), {
  get: (_target, prop) => (typeof prop === 'string' ? `aztec.stub.${prop.toLowerCase()}` : undefined),
});
