import { createLogger } from '@aztec/aztec.js';

import { beforeEach, expect } from '@jest/globals';
import { basename } from 'path';

beforeEach(() => {
  const { testPath, currentTestName } = expect.getState();
  if (!testPath || !currentTestName) {
    return;
  }
  const logger = createLogger(`e2e:${basename(testPath).replace('.test.ts', '')}`);
  logger.info(`Running test: ${currentTestName}`);
});
