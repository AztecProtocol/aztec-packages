import debug from 'debug';
import { readinessListener } from '../../../helpers/browser/index.js';

export async function createThreadWorker() {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const worker = new Worker(new URL(/* webpackIgnore: true */ './thread.worker.js', import.meta.url), {
    type: 'module',
  });
  const debugStr = debug.disable();
  debug.enable(debugStr);
  worker.postMessage({ debug: debugStr });
  await new Promise<void>(resolve => readinessListener(worker, resolve));
  return worker;
}
