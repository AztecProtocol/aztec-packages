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
    await page.goto('http://localhost:8080', { waitUntil: 'load' });

    // Set up download listener before triggering the download
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });

    const result = await page.evaluate(async () => {
      try {
        // Debug: check what's on window
        const keys = Object.keys(window).filter(k => k.includes('test') || k.includes('prove'));

        // Call the test function that's bundled and exposed on window
        if (typeof (window as any).testBbapiLoggingBasic !== 'function') {
          throw new Error(
            `window.testBbapiLoggingBasic is ${typeof (window as any).testBbapiLoggingBasic}, not a function. Available: ${keys.join(', ')}`,
          );
        }
        await (window as any).testBbapiLoggingBasic();
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
    await page.goto('http://localhost:8080?BBAPI_DEBUG_LOG', { waitUntil: 'load' });

    // Set up download listener before triggering the download
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });

    const result = await page.evaluate(async () => {
      try {
        // Call the test function that makes multiple BBAPI calls
        await (window as any).testBbapiLoggingMultiple();
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

  it('Should create msgpack file that can be replayed with bb msgpack run', async () => {
    // Navigate to URL with BBAPI_DEBUG_LOG parameter
    await page.goto('http://localhost:8080?BBAPI_DEBUG_LOG', { waitUntil: 'load' });

    // Set up download listener
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });

    const result = await page.evaluate(async () => {
      try {
        // Call the test function that makes multiple BBAPI calls
        await (window as any).testBbapiLoggingMultiple();
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

    // Save the downloaded file to /tmp
    const download = await downloadPromise;
    const tmpPath = `/tmp/browser-bbapi-test-${Date.now()}.msgpack`;
    await download.saveAs(tmpPath);
    logger.info(`Saved msgpack file to ${tmpPath}`);

    // Try to replay with bb msgpack run
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const { join } = await import('path');
    const { fileURLToPath } = await import('url');
    const { dirname } = await import('path');
    const execAsync = promisify(exec);

    try {
      // Find the bb binary using relative path from this test file
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const bbPath = join(__dirname, '../../../barretenberg/cpp/build/bin/bb');

      // Run bb msgpack run with the downloaded file
      const { stdout, stderr } = await execAsync(`${bbPath} msgpack run -i ${tmpPath}`, {
        timeout: 10000,
      });

      logger.info(`bb msgpack run output: ${stdout}`);
      if (stderr) {
        logger.info(`bb msgpack run stderr: ${stderr}`);
      }

      // Verify the command succeeded (should have processed the msgpack file)
      expect(stdout.length).toBeGreaterThan(0);

      // Verify we got responses for both calls
      expect(stdout).toContain('GrumpkinGetRandomFrResponse');

      logger.info('BBAPI logging replay test passed - msgpack file successfully replayed with bb');
    } catch (e: any) {
      logger.error(`Failed to replay msgpack with bb: ${e.message}`);
      if (e.stdout) {
        logger.error(`stdout: ${e.stdout}`);
      }
      if (e.stderr) {
        logger.error(`stderr: ${e.stderr}`);
      }
      throw e;
    } finally {
      // Clean up temp file
      const { unlinkSync } = await import('fs');
      try {
        unlinkSync(tmpPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it('Should not trigger download when logging is disabled', async () => {
    // Don't set localStorage or URL param - logging should be disabled
    await page.goto('http://localhost:8080', { waitUntil: 'load' });

    // Set up download listener - should NOT receive any download
    let downloadReceived = false;
    page.once('download', () => {
      downloadReceived = true;
    });

    const result = await page.evaluate(async () => {
      try {
        // Call the test function with logging disabled
        await (window as any).testBbapiLoggingBasic();
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
