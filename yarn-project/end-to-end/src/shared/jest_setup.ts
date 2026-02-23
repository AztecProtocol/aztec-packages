import { createLogger } from '@aztec/aztec.js/log';

import { afterEach, beforeEach, expect } from '@jest/globals';
import { basename } from 'path';

import { EluMonitor } from '../fixtures/elu_monitor.js';

const eluMonitor = process.env.ELU_MONITOR_FILE
  ? new EluMonitor(process.env.ELU_MONITOR_FILE, Number(process.env.ELU_MONITOR_INTERVAL_MS) || undefined)
  : undefined;

if (eluMonitor) {
  process.on('exit', () => eluMonitor.stop());
}

beforeEach(() => {
  const { testPath, currentTestName } = expect.getState();
  if (!testPath || !currentTestName) {
    return;
  }
  const logger = createLogger(`e2e:${basename(testPath).replace('.test.ts', '')}`);
  logger.info(`Running test: ${currentTestName}`);
  eluMonitor?.startTest(currentTestName);
});

afterEach(() => {
  eluMonitor?.stopTest();
});
