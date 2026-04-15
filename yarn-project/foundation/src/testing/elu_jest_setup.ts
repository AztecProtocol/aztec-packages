/**
 * Side-effect-only module: registers beforeEach/afterEach jest hooks for ELU monitoring.
 * Import this file (or add it to setupFilesAfterEnv) to enable per-test ELU data collection
 * when the ELU_MONITOR_FILE environment variable is set.
 */
import { afterEach, beforeEach, expect } from '@jest/globals';

import { EluMonitor } from './elu_monitor.js';

const eluMonitor = process.env.ELU_MONITOR_FILE
  ? new EluMonitor(process.env.ELU_MONITOR_FILE, Number(process.env.ELU_MONITOR_INTERVAL_MS) || undefined)
  : undefined;

if (eluMonitor) {
  process.on('exit', () => eluMonitor.stop());
}

beforeEach(() => {
  const { currentTestName } = expect.getState();
  if (!currentTestName) {
    return;
  }
  eluMonitor?.startTest(currentTestName);
});

afterEach(() => {
  eluMonitor?.stopTest();
});
