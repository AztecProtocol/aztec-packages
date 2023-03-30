import times from 'lodash.times';
import { AffineElement, AggregationObject, Fq } from '@aztec/circuits.js';

export function makeEmptyAggregationObject() {
  return new AggregationObject(
    new AffineElement(new Fq(1n), new Fq(2n)),
    new AffineElement(new Fq(1n), new Fq(2n)),
    [],
    times(16, i => 3027 + i),
    false,
  );
}
