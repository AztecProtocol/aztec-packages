import type { AttributeValue, MetricOptions } from '@opentelemetry/api';

import type { MetricDefinition } from './metrics.js';
import type { AllowedAttributeNames, Meter, MetricAttributesType, UpDownCounter } from './telemetry.js';

/** Extracts OpenTelemetry MetricOptions from a MetricDefinition */
export function toMetricOptions(def: MetricDefinition): MetricOptions {
  return {
    description: def.description,
    unit: def.unit,
    valueType: def.valueType,
  };
}

/** A mapping of attribute keys to their possible values */
export type AttributeValuesMap = Partial<Record<AllowedAttributeNames, AttributeValue[]>>;

/**
 * Expands an attribute values map into all combinations of attribute objects.
 * Example: { status: ['ok', 'fail'], type: ['a', 'b'] } =>
 *   [{ status: 'ok', type: 'a' }, { status: 'ok', type: 'b' }, { status: 'fail', type: 'a' }, { status: 'fail', type: 'b' }]
 */
export function expandAttributeCombinations(attrMap: AttributeValuesMap): MetricAttributesType[] {
  const keys = Object.keys(attrMap) as AllowedAttributeNames[];
  if (keys.length === 0) {
    return [{}];
  }

  const result: MetricAttributesType[] = [];

  function generate(index: number, current: MetricAttributesType) {
    if (index === keys.length) {
      result.push({ ...current });
      return;
    }
    const key = keys[index];
    for (const value of attrMap[key]!) {
      current[key] = value;
      generate(index + 1, current);
    }
  }

  generate(0, {});
  return result;
}

/**
 * Creates an UpDownCounter and initializes it to 0.
 * @param meter - The meter to create the counter on
 * @param metric - The metric definition
 * @param attributes - Optional attributes for initialization. Can be:
 *   - AttributeValuesMap: mapping of attribute keys to arrays of possible values (generates cartesian product)
 *   - MetricAttributesType[]: explicit array of attribute objects
 *   - undefined: initializes without attributes
 */
export function createUpDownCounterWithDefault(
  meter: Meter,
  metric: MetricDefinition,
  attributes: AttributeValuesMap | MetricAttributesType[] | undefined = undefined,
): UpDownCounter {
  const counter = meter.createUpDownCounter(metric);
  if (attributes === undefined) {
    counter.add(0);
  } else if (Array.isArray(attributes)) {
    for (const attrs of attributes) {
      counter.add(0, attrs);
    }
  } else {
    const combinations = expandAttributeCombinations(attributes);
    for (const attrs of combinations) {
      counter.add(0, attrs);
    }
  }
  return counter;
}
