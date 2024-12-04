import { type PXE, createCompatibleClient, sleep } from '@aztec/aztec.js';
import { createDebugLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import { type ChildProcess } from 'child_process';

import { isK8sConfig, setupEnvironment, startPortForward } from './utils.js';

jest.setTimeout(2_400_000); // 40 minutes

const config = setupEnvironment(process.env);
const debugLogger = createDebugLogger('aztec:spartan-test:proving');
const SLEEP_MS = 1000;

describe('proving test', () => {
  let pxe: PXE;
  let proc: ChildProcess | undefined;
  beforeAll(async () => {
    let PXE_URL;
    if (isK8sConfig(config)) {
      proc = await startPortForward({
        resource: `svc/${config.INSTANCE_NAME}-aztec-network-pxe`,
        namespace: config.NAMESPACE,
        containerPort: config.CONTAINER_PXE_PORT,
        hostPort: config.HOST_PXE_PORT,
      });
      PXE_URL = `http://127.0.0.1:${config.HOST_PXE_PORT}`;
    } else {
      PXE_URL = config.PXE_URL;
    }
    pxe = await createCompatibleClient(PXE_URL, debugLogger);
  });

  afterAll(() => {
    proc?.kill('SIGKILL');
  });

  it('advances the proven chain', async () => {
    let [provenBlockNumber, blockNumber] = await Promise.all([pxe.getProvenBlockNumber(), pxe.getBlockNumber()]);
    let ok: boolean;

    debugLogger.info(`Initial pending chain tip: ${blockNumber}`);
    debugLogger.info(`Initial proven chain tip: ${provenBlockNumber}`);

    while (true) {
      const [newProvenBlockNumber, newBlockNumber] = await Promise.all([
        pxe.getProvenBlockNumber(),
        pxe.getBlockNumber(),
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
