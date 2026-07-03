import { Wallet } from '@ethersproject/wallet';
import { parentPort, workerData } from 'worker_threads';

type EthJsonV3WorkerData = {
  privateKeyHex: string;
  password: string;
};

type SerializedError = {
  message: string;
  name?: string;
  stack?: string;
};

function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return { message: error.message, name: error.name, stack: error.stack };
  }
  return { message: String(error) };
}

void (async () => {
  try {
    const { privateKeyHex, password } = workerData as EthJsonV3WorkerData;
    const json = await new Wallet(privateKeyHex).encrypt(password);
    parentPort?.postMessage({ json });
  } catch (error) {
    parentPort?.postMessage({ error: serializeError(error) });
  }
})();
