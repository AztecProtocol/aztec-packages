import { AztecClientBackend } from '@aztec/bb.js';

import { expect } from 'chai';
import { ungzip } from 'pako';

import { generate3FunctionTestingIVCStack, generate6FunctionTestingIVCStack, mockLogger, base64ToUint8Array } from './index.js';

const logger = mockLogger;

export async function proveAndVerifyBrowser(bytecodes: string[], witnessStack: Uint8Array[], threads?: number) {
  const preparedBytecodes = bytecodes.map(base64ToUint8Array).map((arr: Uint8Array) => ungzip(arr));
  const backend = new AztecClientBackend(preparedBytecodes, { threads });
  await backend.instantiate();
  const verified = await backend.proveAndVerify(witnessStack.map((arr: Uint8Array) => ungzip(arr)));

  await backend.destroy();
  return verified;
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
    const verifyResult = await proveAndVerifyBrowser(bytecodes, witnessStack);
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
    const verifyResult = await proveAndVerifyBrowser(bytecodes, witnessStack);
    logger.debug('msg', `generated and verified proof. result: ${verifyResult}`);

    expect(verifyResult).to.equal(true);
  }).timeout(60_000_000);
});
