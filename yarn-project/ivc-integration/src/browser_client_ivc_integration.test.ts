import { jest } from '@jest/globals';
import chalk from 'chalk';
import createDebug from 'debug';
import { type Browser, type Page, chromium } from 'playwright';

import { generate3FunctionTestingIVCStack, proveAndVerifyAztecClient } from './index.js';

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
    await page.goto('http://localhost:8080');
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

    logger(`calling prove then verify...`);
    const result = await proveAndVerifyAztecClient(page, bytecodes, witnessStack);
    expect(result).toEqual(true);
  });
});
