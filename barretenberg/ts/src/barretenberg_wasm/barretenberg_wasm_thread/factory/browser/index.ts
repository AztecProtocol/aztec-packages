import { logOptions } from '../../../../log/index.js';
import { readinessListener } from '../../../helpers/browser/index.js';

export async function createThreadWorker() {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const worker = new Worker(new URL('./thread.worker.js', import.meta.url), { type: 'module' });
  worker.postMessage({ log: logOptions });
  await new Promise<void>(resolve => readinessListener(worker, resolve));
  return worker;
}
