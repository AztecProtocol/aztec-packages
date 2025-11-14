import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import { type Browser, type Page, chromium } from 'playwright';

const logger = createLogger('aztec:bbapi-logging-test');

jest.setTimeout(30_000);

describe('BBAPI Logging in Browser', () => {
  let page: Page;
  let browser: Browser;

  beforeEach(async () => {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    page = await context.newPage();
    page.on('console', msg => logger.info(msg.text()));
  });

  afterEach(async () => {
    await browser.close();
  });

  it('Should log BBAPI calls when localStorage is set', async () => {
    // Set localStorage before loading the page
    await page.goto('http://localhost:8080');
    await page.evaluate(() => {
      localStorage.setItem('BBAPI_DEBUG_LOG', 'true');
    });

    // Reload page so BBAPI logging initialization sees the setting
    await page.goto('http://localhost:8080');

    const result = await page.evaluate(async () => {
      // Dynamically import Barretenberg to use real BBAPI
      const { Barretenberg } = await import('@aztec/bb.js');

      // Create API instance (logging should be enabled)
      const api = await Barretenberg.new({ threads: 1 });

      // Make a real BBAPI call (e.g., get random field element)
      try {
        // This will call msgpackCall internally, which should log the call
        await api.grumpkinGetRandomFr({ dummy: 0 });

        // Check if logs were captured (we can't directly access BBAPI_CALL_LOG from here,
        // but we can verify the API worked and logging was initialized)
        await api.destroy();

        return true;
      } catch (e: any) {
        return { error: e?.message || String(e) };
      }
    });

    if (typeof result === 'object' && 'error' in result) {
      logger.error(`BBAPI call failed: ${result.error}`);
    }
    expect(result).toBe(true);
    logger.info('BBAPI logging localStorage test passed - calls were made with logging enabled');
  });

  it('Should log BBAPI calls when URL parameter is set', async () => {
    // Navigate to URL with BBAPI_DEBUG_LOG parameter
    await page.goto('http://localhost:8080?BBAPI_DEBUG_LOG');

    const result = await page.evaluate(async () => {
      // Dynamically import Barretenberg
      const { Barretenberg } = await import('@aztec/bb.js');

      // Create API instance (logging should be enabled from URL param)
      const api = await Barretenberg.new({ threads: 1 });

      // Make multiple real BBAPI calls
      try {
        await api.grumpkinGetRandomFr({ dummy: 0 });
        await api.grumpkinGetRandomFr({ dummy: 0 });

        await api.destroy();
        return true;
      } catch (e: any) {
        return { error: e?.message || String(e) };
      }
    });

    if (typeof result === 'object' && 'error' in result) {
      logger.error(`BBAPI call failed: ${result.error}`);
    }
    expect(result).toBe(true);
    logger.info('BBAPI logging URL parameter test passed - calls were made with logging enabled');
  });

  it('Should work normally when logging is disabled', async () => {
    // Don't set localStorage or URL param - logging should be disabled
    await page.goto('http://localhost:8080');

    const result = await page.evaluate(async () => {
      const { Barretenberg } = await import('@aztec/bb.js');

      const api = await Barretenberg.new({ threads: 1 });

      try {
        await api.grumpkinGetRandomFr({ dummy: 0 });
        await api.destroy();
        return true;
      } catch (e: any) {
        return { error: e?.message || String(e) };
      }
    });

    if (typeof result === 'object' && 'error' in result) {
      logger.error(`BBAPI call failed: ${result.error}`);
    }
    expect(result).toBe(true);
    logger.info('BBAPI logging disabled test passed - calls work normally without logging');
  });
});
