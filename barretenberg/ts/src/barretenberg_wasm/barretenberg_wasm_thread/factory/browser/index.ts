import debug from 'debug';
import { readinessListener } from '../../../helpers/browser/index.js';

export async function createThreadWorker() {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const worker = new Worker(/* webpackMode: 'eager' */ new URL('./thread.worker.js', import.meta.url), {
    type: 'module',
  });
  const debugStr = debug.disable();
  debug.enable(debugStr);
  worker.postMessage({ debug: debugStr });
  console.log('Thread worker created');
  await new Promise<void>(resolve => readinessListener(worker, resolve));
  console.log('Thread worker ready');
  return worker;
}
