import { type AztecNode, createAztecNodeClient, sleep } from '@aztec/aztec.js';
import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';

import { setupEnvironment, startPortForwardForRPC } from './utils.js';

jest.setTimeout(2_400_000); // 40 minutes

const config = setupEnvironment(process.env);
const logger = createLogger('e2e:spartan-test:proving');
const SLEEP_MS = 1000;

describe('proving test', () => {
  let aztecNode: AztecNode;
  const forwardProcesses: ChildProcess[] = [];
  beforeAll(async () => {
    const { process: aztecRpcProcess, port: aztecRpcPort } = await startPortForwardForRPC(config.NAMESPACE);
    forwardProcesses.push(aztecRpcProcess);
    const rpcUrl = `http://127.0.0.1:${aztecRpcPort}`;
    aztecNode = createAztecNodeClient(rpcUrl);
  });

  afterAll(() => {
    forwardProcesses.forEach(p => p.kill());
  });

  it('advances the proven chain', async () => {
    let [provenBlockNumber, blockNumber] = await Promise.all([
      aztecNode.getProvenBlockNumber(),
      aztecNode.getBlockNumber(),
    ]);
    let ok: boolean;

    logger.info(`Initial pending chain tip: ${blockNumber}`);
    logger.info(`Initial proven chain tip: ${provenBlockNumber}`);

    while (true) {
      const [newProvenBlockNumber, newBlockNumber] = await Promise.all([
        aztecNode.getProvenBlockNumber(),
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
