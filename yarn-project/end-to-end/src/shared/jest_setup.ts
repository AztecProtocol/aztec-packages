import { createLogger } from '@aztec/aztec.js/log';

import { afterAll, afterEach, beforeEach, expect } from '@jest/globals';
import { readlinkSync } from 'fs';
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

// Log leaked handles after all tests complete. This runs after test-level afterAll hooks,
// so any handles still alive at this point were not properly cleaned up during teardown.
// This diagnostic helps identify the source of exit hangs without masking them.
afterAll(() => {
  const handles = (process as any)._getActiveHandles();
  if (handles.length > 0) {
    const details = handles.map((h: any) => {
      const type = h?.constructor?.name ?? typeof h;
      const fd = h?.fd ?? h?._handle?.fd ?? '?';
      const destroyed = h?.destroyed ?? '?';
      const hasRef = typeof h?.hasRef === 'function' ? h.hasRef() : '?';
      const localAddr = h?.localAddress ?? '';
      const remoteAddr = h?.remoteAddress ?? '';
      const localPort = h?.localPort ?? '';
      const remotePort = h?.remotePort ?? '';
      const proto = Object.getPrototypeOf(h)?.constructor?.name ?? '?';
      const keys = Object.keys(h).slice(0, 10).join(',');
      let fdTarget = '';
      if (typeof fd === 'number') {
        try {
          fdTarget = ` -> ${readlinkSync(`/proc/self/fd/${fd}`)}`;
        } catch {
          // ignore
        }
      }
      return `  ${type}(fd=${fd}, destroyed=${destroyed}, hasRef=${hasRef}${fdTarget}) proto=${proto} addr=${localAddr}:${localPort}->${remoteAddr}:${remotePort} keys=[${keys}]`;
    });
    process.stderr.write(
      `\n[jest_setup] WARNING: ${handles.length} handle(s) still active after teardown:\n${details.join('\n')}\n` +
        `These may prevent Jest from exiting. Investigate and fix the leak.\n\n`,
    );
  }
});
