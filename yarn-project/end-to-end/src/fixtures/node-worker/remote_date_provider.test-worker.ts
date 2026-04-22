import { type MessagePort, workerData } from 'worker_threads';

import { RemoteDateProvider } from './remote_date_provider.js';

const { datePort, rpcPort } = workerData as { datePort: MessagePort; rpcPort: MessagePort };

const provider = new RemoteDateProvider(datePort);

rpcPort.on('message', () => {
  rpcPort.postMessage(provider.now());
});
