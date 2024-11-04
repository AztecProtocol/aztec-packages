import { jest } from '@jest/globals';
import chalk from 'chalk';
import createDebug from 'debug';
import {
  type Browser,
  type Page,
  chromium,
  /* firefox, webkit */
} from 'playwright';

import {
  generate3FunctionTestingIVCStack,
  generate6FunctionTestingIVCStack,
  proveAndVerifyBrowser,
  proveAndVerifyAztecClient,
} from './index.js';

/* eslint-disable camelcase */

createDebug.enable('*');
const logger = createDebug('aztec:browser-ivc-test');

jest.setTimeout(120_000);

function formatAndPrintLog(message: string): void {
  const parts = message.split('%c');
  if (parts.length === 1) {
    logger(parts[0]);
    return;
  }
  if (!parts[0]) {
    parts.shift();
  }
  const colors = parts[parts.length - 1].split(' color: ');
  parts[parts.length - 1] = colors.shift()!;

  let formattedMessage = '';
  for (let i = 0; i < parts.length; i++) {
    const colorValue = colors[i];

    if (colorValue === 'inherit' || !colorValue) {
      formattedMessage += parts[i];
    } else if (colorValue.startsWith('#')) {
      formattedMessage += chalk.hex(colorValue)(parts[i]);
    } else {
      formattedMessage += parts[i];
    }
  }

  logger(formattedMessage);
}

describe('Client IVC Integration', () => {
  let page: Page;
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    page = await context.newPage();
    page.on('console', msg => formatAndPrintLog(msg.text()));
    await page.goto('about:blank');
    await page.exposeFunction('proveAndVerifyBrowser', proveAndVerifyBrowser);
  });

  afterAll(async () => {
    await browser.close();
  });

  // This test will verify a client IVC proof of a simple tx:
  // 1. Run a mock app that creates two commitments
  // 2. Run the init kernel to process the app run
  // 3. Run the tail kernel to finish the client IVC chain.
  it('Should generate a verifiable client IVC proof from a simple mock tx via bb.js', async () => {
    const [bytecodes, witnessStack] = await generate3FunctionTestingIVCStack();

    logger(`calling prove and verify...`);
    const verifyResult = await proveAndVerifyAztecClient(page, bytecodes, witnessStack);
    logger(`generated and verified proof. result: ${verifyResult}`);

    expect(verifyResult).toEqual(true);
  });

  // This test will verify a client IVC proof of a more complex tx:
  // 1. Run a mock app that creates two commitments
  // 2. Run the init kernel to process the app run
  // 3. Run a mock app that reads one of those commitments
  // 4. Run the inner kernel to process the second app run
  // 5. Run the reset kernel to process the read request emitted by the reader app
  // 6. Run the tail kernel to finish the client IVC chain
  it('Should generate a verifiable client IVC proof from a simple mock tx via bb.js', async () => {
    const [bytecodes, witnessStack] = await generate6FunctionTestingIVCStack();

    logger(`calling prove and verify...`);
    const verifyResult = await proveAndVerifyAztecClient(page, bytecodes, witnessStack);
    logger(`generated and verified proof. result: ${verifyResult}`);

    expect(verifyResult).toEqual(true);
  });
});
