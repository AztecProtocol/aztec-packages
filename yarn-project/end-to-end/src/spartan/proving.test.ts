import { type AztecNode, type PXE, createAztecNodeClient, sleep } from '@aztec/aztec.js';
import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';

import { startCompatiblePXE } from './setup_test_wallets.js';
import { setupEnvironment, startPortForwardForRPC } from './utils.js';

jest.setTimeout(2_400_000); // 40 minutes

const config = setupEnvironment(process.env);
const debugLogger = createLogger('e2e:spartan-test:proving');
const SLEEP_MS = 1000;

describe('proving test', () => {
  let _pxe: PXE;
  let aztecNode: AztecNode;
  const forwardProcesses: ChildProcess[] = [];
  let cleanup: undefined | (() => Promise<void>);
  beforeAll(async () => {
    const { process: aztecRpcProcess, port: aztecRpcPort } = await startPortForwardForRPC(config.NAMESPACE);
    forwardProcesses.push(aztecRpcProcess);
    const rpcUrl = `http://127.0.0.1:${aztecRpcPort}`;
    ({ pxe: _pxe, cleanup } = await startCompatiblePXE(rpcUrl, config.REAL_VERIFIER, debugLogger));
    aztecNode = createAztecNodeClient(rpcUrl);
  });

  afterAll(async () => {
    await cleanup?.();
    forwardProcesses.forEach(p => p.kill());
  });

  it('advances the proven chain', async () => {
    let [provenBlockNumber, blockNumber] = await Promise.all([
      aztecNode.getProvenBlockNumber(),
      aztecNode.getBlockNumber(),
    ]);
    let ok: boolean;

    debugLogger.info(`Initial pending chain tip: ${blockNumber}`);
    debugLogger.info(`Initial proven chain tip: ${provenBlockNumber}`);

    while (true) {
      const [newProvenBlockNumber, newBlockNumber] = await Promise.all([
        aztecNode.getProvenBlockNumber(),
        aztecNode.getBlockNumber(),
      ]);

      if (newBlockNumber > blockNumber) {
        debugLogger.info(`Pending chain has advanced: ${blockNumber} -> ${newBlockNumber}`);
      } else if (newBlockNumber < blockNumber) {
        debugLogger.error(`Pending chain has been pruned: ${blockNumber} -> ${newBlockNumber}`);
        ok = false;
        break;
      }

      if (newProvenBlockNumber > provenBlockNumber) {
        debugLogger.info(`Proven chain has advanced: ${provenBlockNumber} -> ${newProvenBlockNumber}`);
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
