import { beforeEach, describe, it } from '@jest/globals';

import { setup } from './fixtures/utils.js';
import { type Logger } from '@aztec/foundation/log';

describe('E2E Outbox Tests', () => {
  let teardown: () => void;
  let logger: Logger;

  beforeEach(async () => {
    ({ teardown, logger } = await setup(1));
  });

  afterAll(() => teardown());

  it('Correctly runs setup', () => {
    logger.info('Done');
  });
});
