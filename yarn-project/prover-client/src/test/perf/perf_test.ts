import { sleep } from '@aztec/foundation/sleep';

import { once } from 'events';
import { Worker } from 'worker_threads';

const queue = new Worker(new URL(await import.meta!.resolve!('./producer.js')), {
  workerData: {
    port: 8080,
  },
  env: process.env,
});

await once(queue, 'message');

const workers = [];
let nextWorkerId = 1;

function spawnWorkers(n: number) {
  return async () => {
    for (let i = 0; i < n; i++) {
      const worker = new Worker(new URL(await import.meta.resolve!('./consumer.js')), {
        workerData: {
          jobSource: 'http://127.0.0.1:8080',
          pollIntervalMs: 10000,
          name: String(nextWorkerId++),
        },
        env: process.env,
      });

      await once(worker, 'message');
      workers.push(worker);

      await sleep(250 + Math.random() * 250);
    }
  };
}

function wait(minutes: number) {
  return () => sleep(minutes * 60 * 1000);
}

for (const fn of [spawnWorkers(4), wait(15), spawnWorkers(16), wait(15), spawnWorkers(80)]) {
  await fn();
}
