import { expect } from 'chai';

import { generate3FunctionTestingIVCStack, generate6FunctionTestingIVCStack, mockLogger } from './index.js';

const logger = mockLogger;

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

describe('Client IVC Integration', () => {
  // beforeAll(async () => {
  //   browser = await chromium.launch({ headless: true });
  //   const context = await browser.newContext();
  //   page = await context.newPage();
  //   page.on('console', msg => formatAndPrintLog(msg.text()));
  //   await page.goto('http://localhost:8080');
  // });

  // afterAll(async () => {
  //   await browser.close();
  // });

  // This test will verify a client IVC proof of a simple tx:
  // 1. Run a mock app that creates two commitments
  // 2. Run the init kernel to process the app run
  // 3. Run the tail kernel to finish the client IVC chain.
  it('Should generate a verifiable client IVC proof from a simple mock tx via bb.js', async () => {
    const [bytecodes, witnessStack] = await generate3FunctionTestingIVCStack();

    logger.debug('msg', `calling prove and verify...`);
    const verifyResult = await proveThenVerifyAztecClientBrowser(bytecodes, witnessStack);
    logger.debug('msg', `generated and verified proof. result: ${verifyResult}`);

    expect(verifyResult).to.equal(true);
  }).timeout(60_000_000);

  // This test will verify a client IVC proof of a more complex tx:
  // 1. Run a mock app that creates two commitments
  // 2. Run the init kernel to process the app run
  // 3. Run a mock app that reads one of those commitments
  // 4. Run the inner kernel to process the second app run
  // 5. Run the reset kernel to process the read request emitted by the reader app
  // 6. Run the tail kernel to finish the client IVC chain
  it('Should generate a verifiable client IVC proof from a simple mock tx via bb.js', async () => {
    const [bytecodes, witnessStack] = await generate6FunctionTestingIVCStack();

    logger.debug('msg', `calling prove and verify...`);
    const verifyResult = await proveThenVerifyAztecClientBrowser(bytecodes, witnessStack);
    logger.debug('msg', `generated and verified proof. result: ${verifyResult}`);

    expect(verifyResult).to.equal(true);
  }).timeout(60_000_000);
});
