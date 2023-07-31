import { DebugLogger, createDebugLogger } from '@aztec/foundation/log';

import path from 'path';
import { Browser, Page, launch } from 'puppeteer';

// Don't forget to run `yarn build` before running this test as it uses the webpack transpiled JS.
describe('aztec.js on the browser', () => {
  let browser: Browser;
  let page: Page;
  let logger: DebugLogger;

  beforeAll(() => {
    logger = createDebugLogger('aztec:js:web');
  });

  it('AztecJS compiled library can be loaded in a browser', async () => {
    browser = await launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--headless',
        '--disable-web-security',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disk-cache-dir=/dev/null',
      ],
    });
    page = await browser.newPage();
    page.on('console', msg => {
      logger('PAGE MSG:', msg.text());
    });
    page.on('pageerror', err => {
      logger('PAGE ERROR:', err.toString());
    });

    // await page.addScriptTag
    await page.goto(`file://${path.resolve(process.cwd(), './src/test/index.html')}`);
    const createAccountsExists = await page.evaluate(() => {
      const { createAccounts } = (window as any)['AztecJS'];
      return typeof createAccounts === 'function';
    });
    expect(createAccountsExists).toBe(true);
  });
});
