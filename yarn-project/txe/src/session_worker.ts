import { Timer } from '@aztec/foundation/timer';
import type { ProtocolContract } from '@aztec/protocol-contracts';

import { parentPort, workerData } from 'worker_threads';

import { TXESession } from './txe_session.js';
import type { TXEOracleFunctionName } from './txe_session.js';
import type { ForeignCallArgs, ForeignCallResult } from './util/encoding.js';
import { deserializeForeignCallArgs, deserializeProtocolContracts } from './util/serialization.js';

interface WorkerMessage {
  type: 'process';
  functionName: TXEOracleFunctionName;
  inputs: ForeignCallArgs;
}

interface WorkerResponse {
  type: 'result' | 'error';
  result?: ForeignCallResult;
  error?: string;
}

// This worker handles a single session for its entire lifetime
let session: TXESession | undefined;

async function initSession(protocolContracts: ProtocolContract[]): Promise<TXESession> {
  if (!session) {
    session = await TXESession.init(protocolContracts);
  }
  return session;
}

async function processMessage(message: WorkerMessage): Promise<WorkerResponse> {
  try {
    if (!session) {
      throw new Error('Session not initialized');
    }

    // Deserialize the inputs back to their original form
    const deserializedInputs = deserializeForeignCallArgs(message.inputs);

    const result = await session.processFunction(message.functionName, deserializedInputs);

    return {
      type: 'result',
      result,
    };
  } catch (error) {
    return {
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Worker initialization and main loop
if (parentPort && workerData) {
  const { serializedProtocolContracts } = workerData as { serializedProtocolContracts: string };

  // Deserialize protocol contracts
  const protocolContracts = deserializeProtocolContracts(serializedProtocolContracts);

  // Initialize the session once when the worker starts
  initSession(protocolContracts)
    .then(() => {
      parentPort!.postMessage({ type: 'ready' });

      // Process messages for this session
      parentPort!.on('message', (message: WorkerMessage) => {
        processMessage(message)
          .then(response => {
            parentPort!.postMessage(response);
          })
          .catch(error => {
            parentPort!.postMessage({
              type: 'error',
              error: error instanceof Error ? error.message : String(error),
            });
          });
      });
    })
    .catch(error => {
      parentPort!.postMessage({
        type: 'error',
        error: `Failed to initialize session: ${error}`,
      });
    });
}
