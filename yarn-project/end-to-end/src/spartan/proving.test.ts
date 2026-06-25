import { type AztecNode, createAztecNodeClient } from '@aztec/aztec.js/node';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';

import { jest } from '@jest/globals';

import { ChainHealth, type ServiceEndpoint, getRPCEndpoint, setupEnvironment } from './utils.js';

jest.setTimeout(2_400_000); // 40 minutes

const config = setupEnvironment(process.env);
const logger = createLogger('e2e:spartan-test:proving');
const SLEEP_MS = 1000;

// Verifies that the proven chain tip advances on a live k8s deployment. Polls aztecNode.getBlockNumber('proven')
// until it surpasses the initial value, confirming at least one epoch was proven end-to-end.
describe('proving test', () => {
  let aztecNode: AztecNode;
  const endpoints: ServiceEndpoint[] = [];
  const health = new ChainHealth(config.NAMESPACE, logger);

  beforeAll(async () => {
    await health.setup();
    const rpcEndpoint = await getRPCEndpoint(config.NAMESPACE);
    endpoints.push(rpcEndpoint);
    aztecNode = createAztecNodeClient(rpcEndpoint.url);
  });

  afterAll(async () => {
    await health.teardown();
    endpoints.forEach(e => e.process?.kill());
  });

  it('advances the proven chain', async () => {
    let [provenBlockNumber, blockNumber] = await Promise.all([
      aztecNode.getBlockNumber('proven'),
      aztecNode.getBlockNumber(),
    ]);
    let ok: boolean;

    logger.info(`Initial pending chain tip: ${blockNumber}`);
    logger.info(`Initial proven chain tip: ${provenBlockNumber}`);

    while (true) {
      const [newProvenBlockNumber, newBlockNumber] = await Promise.all([
        aztecNode.getBlockNumber('proven'),
        aztecNode.getBlockNumber(),
      ]);

      if (newBlockNumber > blockNumber) {
        logger.info(`Pending chain has advanced: ${blockNumber} -> ${newBlockNumber}`);
      } else if (newBlockNumber < blockNumber) {
        logger.error(`Pending chain has been pruned: ${blockNumber} -> ${newBlockNumber}`);
        ok = false;
        break;
      }

      if (newProvenBlockNumber > provenBlockNumber) {
        logger.info(`Proven chain has advanced: ${provenBlockNumber} -> ${newProvenBlockNumber}`);
        ok = true;
        break;
      }

      provenBlockNumber = newProvenBlockNumber;
      blockNumber = newBlockNumber;

      await sleep(SLEEP_MS);
    }

    expect(ok).toBeTrue();
  });
});
