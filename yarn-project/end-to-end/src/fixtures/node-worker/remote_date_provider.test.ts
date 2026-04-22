import { sleep } from '@aztec/foundation/sleep';
import { TestDateProvider } from '@aztec/foundation/timer';

import { MessageChannel, type MessagePort, Worker } from 'worker_threads';

import { DateProviderBridge } from './date_provider_bridge.js';

describe('RemoteDateProvider', () => {
  const queryWorkerNow = (rpcPort: MessagePort): Promise<number> =>
    new Promise(resolve => {
      rpcPort.once('message', (msg: number) => resolve(msg));
      rpcPort.postMessage('now');
    });

  it('tracks main-thread TestDateProvider mutations via MessagePort', async () => {
    const provider = new TestDateProvider();
    const bridge = new DateProviderBridge(provider);

    const dateChan = new MessageChannel();
    const rpcChan = new MessageChannel();

    const workerUrl = new URL('./remote_date_provider.test-worker.js', import.meta.url);
    workerUrl.pathname = workerUrl.pathname.replace('/src/', '/dest/');

    const worker = new Worker(workerUrl, {
      workerData: { datePort: dateChan.port1, rpcPort: rpcChan.port1 },
      transferList: [dateChan.port1, rpcChan.port1],
    });

    try {
      await new Promise<void>(resolve => worker.once('online', () => resolve()));
      bridge.addObserver(dateChan.port2);

      // Give the initial offset message a tick to propagate.
      await sleep(50);

      // Base case: worker.now() is within a tolerance of main's Date.now().
      const mainBefore = Date.now();
      const workerBefore = await queryWorkerNow(rpcChan.port2);
      expect(Math.abs(workerBefore - mainBefore)).toBeLessThan(100);

      // Warp forward.
      const target = Date.now() + 10_000_000;
      provider.setTime(target);
      await sleep(50);

      const workerAfter = await queryWorkerNow(rpcChan.port2);
      expect(Math.abs(workerAfter - target)).toBeLessThan(100);

      // Reset brings the offset back to zero.
      provider.reset();
      await sleep(50);

      const workerReset = await queryWorkerNow(rpcChan.port2);
      expect(Math.abs(workerReset - Date.now())).toBeLessThan(100);
    } finally {
      bridge.removeObserver(dateChan.port2);
      dateChan.port2.close();
      rpcChan.port2.close();
      await worker.terminate();
    }
  });
});
