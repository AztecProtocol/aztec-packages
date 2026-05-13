import { readinessListener } from '../../../helpers/browser/index.js';

export async function createMainWorker() {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const worker = new Worker(new URL('./main.worker.js', import.meta.url), { type: 'module' });
  // Race the readiness signal against:
  //   - parent-side `error` events (often have all fields stripped to
  //     `undefined` for cross-origin/opaque failures);
  //   - worker-posted `{type: 'worker-error'}` messages, which carry
  //     the real `message`/`filename`/`lineno`/`stack` because they
  //     come from inside the worker via `self.addEventListener('error',
  //     …)` plus the async-IIFE try/catch in main.worker.ts.
  //
  // The opaque parent-side `error` event tends to fire before the
  // self-reported message, so we hold onto it for a short grace
  // window — if a `worker-error` arrives in that window, we reject
  // with the rich info; otherwise we reject with what we have.
  return new Promise<Worker>((resolve, reject) => {
    let opaqueError: Error | null = null;
    let opaqueTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      worker.removeEventListener('error', onError);
      worker.removeEventListener('messageerror', onMessageError);
      worker.removeEventListener('message', onMessage);
      if (opaqueTimer !== null) {
        clearTimeout(opaqueTimer);
        opaqueTimer = null;
      }
    };
    const onError = (e: ErrorEvent) => {
      opaqueError = new Error(
        `main bb worker failed to load: ${e.message} (${e.filename}:${e.lineno})`,
      );
      if (opaqueTimer === null) {
        opaqueTimer = setTimeout(() => {
          cleanup();
          reject(opaqueError!);
        }, 50);
      }
    };
    const onMessageError = (e: MessageEvent) => {
      cleanup();
      reject(new Error(`main bb worker messageerror: ${String(e.data)}`));
    };
    const onMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'worker-error') {
        cleanup();
        reject(
          new Error(
            `main bb worker self-reported error: ${e.data.message} ` +
              `(${e.data.filename}:${e.data.lineno})\n${e.data.stack ?? ''}`,
          ),
        );
      } else if (e.data.type === 'worker-unhandled-rejection') {
        cleanup();
        reject(
          new Error(
            `main bb worker unhandled rejection: ${e.data.reasonString}\n${e.data.stack ?? ''}`,
          ),
        );
      }
    };
    worker.addEventListener('error', onError);
    worker.addEventListener('messageerror', onMessageError);
    worker.addEventListener('message', onMessage);
    readinessListener(worker, () => {
      cleanup();
      resolve(worker);
    });
  });
}
