import { createLogger } from '@aztec/foundation/log';

import { GrumpkinScalar } from '../../fields/fields.js';
import type { Point } from '../../fields/point.js';
import { Grumpkin } from './index.js';

const log = createLogger('circuits:grumpkin_test');

describe('grumpkin', () => {
  let grumpkin!: Grumpkin;

  beforeAll(() => {
    grumpkin = new Grumpkin();
  });

  it('should correctly perform scalar muls', async () => {
    const exponent = GrumpkinScalar.random();

    const numPoints = 3;

    const inputPoints: Point[] = [];
    for (let i = 0; i < numPoints; ++i) {
      inputPoints.push(await grumpkin.mul(Grumpkin.generator, GrumpkinScalar.random()));
    }

    const start = new Date().getTime();
    const outputPoints = await grumpkin.batchMul(inputPoints, exponent);
    log.debug(`batch mul in: ${new Date().getTime() - start}ms`);

    const start2 = new Date().getTime();
    for (let i = 0; i < numPoints; ++i) {
      await grumpkin.mul(inputPoints[i], exponent);
    }
    log.debug(`regular mul in: ${new Date().getTime() - start2}ms`);

    for (let i = 0; i < numPoints; ++i) {
      const lhs = outputPoints[i];
      const rhs = await grumpkin.mul(inputPoints[i], exponent);
      expect(lhs).toEqual(rhs);
    }
  });
});
