import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import { type Browser, type Page, chromium } from /* firefox, webkit */ 'playwright';

import { generate3FunctionTestingIVCStack, generate6FunctionTestingIVCStack } from './index.js';
import { proveThenVerifyAztecClient } from './prove_wasm.js';

const logger = createLogger('aztec:ivc-test');

jest.setTimeout(120_000);

export async function proveThenVerifyAztecClientBrowser(
  page: Page,
  bytecodes: string[],
  witnessStack: Uint8Array[],
): Promise<boolean> {
  const threads = 16;

  const result: boolean = await page.evaluate(
    ([acir, witness, numThreads]) => {
      (window as any).proveThenVerifyAztecClient = proveThenVerifyAztecClient;
      return (window as any).proveThenVerifyAztecClient(acir, witness, numThreads);
    },
    [bytecodes, witnessStack, threads],
  );

  return result;
}

describe.skip('Client IVC Integration', () => {
  let page: Page;
  let browser: Browser;

  beforeEach(async () => {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    page = await context.newPage();
    page.on('console', msg => logger.info(msg.text()));
    await page.goto('http://localhost:8080');
  });

  afterEach(async () => {
    await browser.close();
  });

  // This test will verify a client IVC proof of a simple tx:
  // 1. Run a mock app that creates two commitments
  // 2. Run the init kernel to process the app run
  // 3. Run the tail kernel to finish the client IVC chain.
  it.skip('Should generate a verifiable client IVC proof from a simple mock tx via bb.js', async () => {
    const [bytecodes, witnessStack] = await generate3FunctionTestingIVCStack();

    logger.info(`calling prove then verify...`);
    const verifyResult = await proveThenVerifyAztecClientBrowser(page, bytecodes, witnessStack);
    logger.info(`generated then verified proof. result: ${verifyResult}`);

    expect(verifyResult).toEqual(true);
  });

  // This test will verify a client IVC proof of a more complex tx:
  // 1. Run a mock app that creates two commitments
  // 2. Run the init kernel to process the app run
  // 3. Run a mock app that reads one of those commitments
  // 4. Run the inner kernel to process the second app run
  // 5. Run the reset kernel to process the read request emitted by the reader app
  // 6. Run the tail kernel to finish the client IVC chain
  it.skip('Should generate a verifiable client IVC proof from a simple mock tx via bb.js', async () => {
    const [bytecodes, witnessStack] = await generate6FunctionTestingIVCStack();

    logger.info(`calling prove then verify...`);
    const verifyResult = await proveThenVerifyAztecClientBrowser(page, bytecodes, witnessStack);
    logger.info(`generated then verified proof. result: ${verifyResult}`);

    expect(verifyResult).toEqual(true);
  });
});
