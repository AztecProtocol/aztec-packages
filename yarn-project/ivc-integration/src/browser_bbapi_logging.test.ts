import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import { type Browser, type Download, type Page, chromium } from 'playwright';

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

  it('Should log BBAPI calls and save msgpack when localStorage is set', async () => {
    // Set localStorage before loading the page
    await page.goto('http://localhost:8080');
    await page.evaluate(() => {
      localStorage.setItem('BBAPI_DEBUG_LOG', 'true');
    });

    // Reload page so BBAPI logging initialization sees the setting
    await page.goto('http://localhost:8080');

    // Set up download listener before triggering the download
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });

    const result = await page.evaluate(async () => {
      // Dynamically import Barretenberg to use real BBAPI
      const { Barretenberg } = await import('@aztec/bb.js');

      // Create API instance (logging should be enabled)
      const api = await Barretenberg.new({ threads: 1 });

      // Make a real BBAPI call (e.g., get random field element)
      try {
        // This will call msgpackCall internally, which should log the call
        await api.grumpkinGetRandomFr({ dummy: 0 });

        // Destroy will trigger flushBbapiLogs() which should save and download
        await api.destroy();

        return { success: true };
      } catch (e: any) {
        return { error: e?.message || String(e) };
      }
    });

    if ('error' in result) {
      logger.error(`BBAPI call failed: ${result.error}`);
      expect(result).toHaveProperty('success');
      return;
    }

    // Wait for and verify the download
    let download: Download | undefined;
    try {
      download = await downloadPromise;
      const filename = download.suggestedFilename();
      logger.info(`Download received: ${filename}`);

      // Verify filename matches expected pattern
      expect(filename).toMatch(/^bbapi-logs-.*\.msgpack$/);

      // Read the downloaded file content
      const buffer = await download.createReadStream().then(async stream => {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
      });

      // Verify the msgpack file has content (at least size prefix + some data)
      expect(buffer.length).toBeGreaterThan(4);

      // Verify it starts with a 4-byte size prefix (little-endian)
      const size = buffer.readUInt32LE(0);
      logger.info(`First msgpack entry size: ${size} bytes`);
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThan(buffer.length); // Size should be reasonable

      logger.info('BBAPI logging localStorage test passed - msgpack download verified');
    } catch (e: any) {
      if (e.message?.includes('Timeout')) {
        logger.error('Download timeout - flushBbapiLogs() may not have triggered download');
      } else {
        logger.error(`Download verification failed: ${e.message}`);
      }
      throw e;
    }
  });

  it('Should log BBAPI calls and save msgpack when URL parameter is set', async () => {
    // Navigate to URL with BBAPI_DEBUG_LOG parameter
    await page.goto('http://localhost:8080?BBAPI_DEBUG_LOG');

    // Set up download listener before triggering the download
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });

    const result = await page.evaluate(async () => {
      // Dynamically import Barretenberg
      const { Barretenberg } = await import('@aztec/bb.js');

      // Create API instance (logging should be enabled from URL param)
      const api = await Barretenberg.new({ threads: 1 });

      // Make multiple real BBAPI calls
      try {
        await api.grumpkinGetRandomFr({ dummy: 0 });
        await api.grumpkinGetRandomFr({ dummy: 0 });

        // Destroy will trigger flushBbapiLogs() which should save and download
        await api.destroy();
        return { success: true };
      } catch (e: any) {
        return { error: e?.message || String(e) };
      }
    });

    if ('error' in result) {
      logger.error(`BBAPI call failed: ${result.error}`);
      expect(result).toHaveProperty('success');
      return;
    }

    // Wait for and verify the download
    try {
      const download = await downloadPromise;
      const filename = download.suggestedFilename();
      logger.info(`Download received: ${filename}`);

      // Verify filename matches expected pattern
      expect(filename).toMatch(/^bbapi-logs-.*\.msgpack$/);

      // Read the downloaded file content
      const buffer = await download.createReadStream().then(async stream => {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
      });

      // Verify the msgpack file has content for 2 calls
      expect(buffer.length).toBeGreaterThan(8); // At least 2 size prefixes

      // Parse and count entries
      let offset = 0;
      let entryCount = 0;
      while (offset < buffer.length) {
        const size = buffer.readUInt32LE(offset);
        offset += 4 + size;
        entryCount++;
      }

      logger.info(`Found ${entryCount} BBAPI calls in msgpack file`);
      expect(entryCount).toBeGreaterThanOrEqual(2); // At least the 2 grumpkinGetRandomFr calls

      logger.info('BBAPI logging URL parameter test passed - msgpack download verified');
    } catch (e: any) {
      if (e.message?.includes('Timeout')) {
        logger.error('Download timeout - flushBbapiLogs() may not have triggered download');
      } else {
        logger.error(`Download verification failed: ${e.message}`);
      }
      throw e;
    }
  });

  it('Should not trigger download when logging is disabled', async () => {
    // Don't set localStorage or URL param - logging should be disabled
    await page.goto('http://localhost:8080');

    // Set up download listener - should NOT receive any download
    let downloadReceived = false;
    page.once('download', () => {
      downloadReceived = true;
    });

    const result = await page.evaluate(async () => {
      const { Barretenberg } = await import('@aztec/bb.js');

      const api = await Barretenberg.new({ threads: 1 });

      try {
        await api.grumpkinGetRandomFr({ dummy: 0 });
        await api.destroy();
        return { success: true };
      } catch (e: any) {
        return { error: e?.message || String(e) };
      }
    });

    if ('error' in result) {
      logger.error(`BBAPI call failed: ${result.error}`);
      expect(result).toHaveProperty('success');
      return;
    }

    // Wait a bit to ensure no download is triggered
    await page.waitForTimeout(500);

    // Verify no download was triggered
    expect(downloadReceived).toBe(false);
    logger.info('BBAPI logging disabled test passed - no download triggered when logging disabled');
  });
});
