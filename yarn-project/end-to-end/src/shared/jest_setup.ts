import { createLogger } from '@aztec/aztec.js';

import { afterEach, beforeEach, expect } from '@jest/globals';
import { basename } from 'path';

function makeLogger(testPath: string) {
  return createLogger(`e2e:${basename(testPath).replace('.test.ts', '')}`);
}

beforeEach(() => {
  const { testPath, currentTestName } = expect.getState();
  if (!testPath || !currentTestName) {
    return;
  }
  const logger = makeLogger(testPath);
  logger.info(`Running test: ${currentTestName}`);
});

afterEach(() => {
  const { testPath, currentTestName, error } = expect.getState();
  if (!testPath || !currentTestName) {
    return;
  }
  const logger = makeLogger(testPath);
  if (error) {
    logger.error(`Failed test: ${currentTestName}`, error);
  } else {
    logger.info(`Finished test: ${currentTestName}`);
  }
});
