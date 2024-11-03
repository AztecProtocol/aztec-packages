import { createDebugLogger } from '@aztec/foundation/log';
import { jest } from '@jest/globals';
import chalk from 'chalk';
import {
  type Browser,
  type Page,
  chromium,
  /* firefox, webkit */
} from 'playwright';

import {
  MOCK_MAX_COMMITMENTS_PER_TX,
  MockAppCreatorCircuit,
  MockAppReaderCircuit,
  MockPrivateKernelInitCircuit,
  MockPrivateKernelInnerCircuit,
  MockPrivateKernelResetCircuit,
  MockPrivateKernelTailCircuit,
  witnessGenCreatorAppMockCircuit,
  witnessGenMockPrivateKernelInitCircuit,
  witnessGenMockPrivateKernelInnerCircuit,
  witnessGenMockPrivateKernelResetCircuit,
  witnessGenMockPrivateKernelTailCircuit,
  witnessGenReaderAppMockCircuit,
  proveAndVerifyAztecClient
} from './index.js';

/* eslint-disable camelcase */

const logger = createDebugLogger('aztec:browser-ivc-test');

jest.setTimeout(120_000);

function formatAndPrintLog(message: string): void {
  const parts = message.split('%c');
  if (parts.length === 1) {
    logger.debug(parts[0]);
    return;
  }
  if (!parts[0]) {
    parts.shift();
  }
  const colors = parts[parts.length - 1].split(' color: ');
  parts[parts.length - 1] = colors.shift()!;

  // logger.debug({ message, parts, colors });

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

  logger.debug(formattedMessage);
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
    const tx = {
      number_of_calls: '0x1',
    };
    // Witness gen app and kernels
    const appWitnessGenResult = await witnessGenCreatorAppMockCircuit({ commitments_to_create: ['0x1', '0x2'] });
    logger.debug('generated app mock circuit witness');

    const initWitnessGenResult = await witnessGenMockPrivateKernelInitCircuit({
      app_inputs: appWitnessGenResult.publicInputs,
      tx,
    });
    logger.debug('generated mock private kernel init witness');

    const tailWitnessGenResult = await witnessGenMockPrivateKernelTailCircuit({
      prev_kernel_public_inputs: initWitnessGenResult.publicInputs,
    });
    logger.debug('generated mock private kernel tail witness');

    // Create client IVC proof
    const bytecodes = [
      MockAppCreatorCircuit.bytecode,
      MockPrivateKernelInitCircuit.bytecode,
      MockPrivateKernelTailCircuit.bytecode,
    ];
    logger.debug('built bytecode array');
    const witnessStack = [appWitnessGenResult.witness, initWitnessGenResult.witness, tailWitnessGenResult.witness];
    logger.debug('built witness stack');

    const verifyResult = await proveAndVerifyAztecClient(page, bytecodes, witnessStack);
    logger.debug(`generated and verified proof. result: ${verifyResult}`);

    expect(verifyResult).toEqual(true);
  });
});
