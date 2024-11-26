import { createDebugLogger } from '@aztec/aztec.js';

import { AlertChecker } from './alert_checker.js';

const ALERTS_FILE = process.env.ALERTS_FILE;

if (!ALERTS_FILE) {
  throw new Error('ALERTS_FILE is not set');
}

describe('Alert Checker', () => {
  const logger = createDebugLogger('aztec:alert-checker');
  const alertChecker = new AlertChecker(logger);

  it('should check alerts', async () => {
    await alertChecker.runAlertCheckFromFilePath(ALERTS_FILE);
  });
});
