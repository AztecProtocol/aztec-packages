// import { Wallet } from '@aztec/aztec.js';
// import { AztecAddress } from '@aztec/circuits.js';
// import { DebugLogger } from '@aztec/foundation/log';
// import { ZkTokenContract } from '@aztec/noir-contracts/types';
// import { AztecRPC } from '@aztec/types';
import path from 'path';
import { Browser, Page, launch } from 'puppeteer';

import { setup } from './utils.js';

const conditionalIt = () => (process.env.SANDBOX_URL ? it : it.skip);

describe('e2e_aztec.js_browser', () => {
  // let aztecRpcClient: AztecRPC;
  // let wallet: Wallet;
  // let accounts: AztecAddress[];
  // let logger: DebugLogger;
  // let contract: ZkTokenContract;

  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
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
    await page.goto(`file://${path.resolve(process.cwd(), './src/web/index.html')}`);
  });

  beforeEach(async () => {
    // ({ aztecRpcServer: aztecRpcClient, accounts, wallet, logger } = await setup(2));
  }, 100_000);

  conditionalIt()('Deploy zk token contract', async () => {
    // const initialBalance = 33n;
    const createAccountsExists = await page.evaluate(() => {
      const { createAccounts } = (window as any)['AztecJS'];
      return typeof createAccounts === 'function';
    });
    expect(createAccountsExists).toBe(true);
  });
});
