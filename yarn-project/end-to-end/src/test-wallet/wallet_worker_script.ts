import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';
import type { ApiSchema } from '@aztec/foundation/schemas';
import { parseWithOptionals, schemaHasMethod } from '@aztec/foundation/schemas';
import { NodeListener, TransportServer } from '@aztec/foundation/transport';

import { workerData } from 'worker_threads';

import { TestWallet } from './test_wallet.js';
import { WorkerWalletSchema } from './worker_wallet_schema.js';

const logger = createLogger('e2e:test-wallet:worker');

try {
  const { nodeUrl, pxeConfig } = workerData as { nodeUrl: string; pxeConfig?: Record<string, unknown> };

  logger.info('Initializing worker wallet', { nodeUrl });
  const node = createAztecNodeClient(nodeUrl);
  const wallet = await TestWallet.create(node, pxeConfig);
  logger.info('Worker wallet initialized');

  /** Handlers for methods that need custom implementation (not direct wallet passthrough). */
  const handlers: Record<string, (...args: any[]) => Promise<any>> = {
    proveTx: async (exec, opts) => {
      const provenTx = await wallet.proveTx(exec, opts);
      // ProvenTx has non-serializable fields (node proxy, etc.) — extract only Tx-compatible fields
      const { data, chonkProof, contractClassLogFields, publicFunctionCalldata } = provenTx;
      return { data, chonkProof, contractClassLogFields, publicFunctionCalldata };
    },
    registerAccount: async (secret, salt) => {
      const manager = await wallet.createSchnorrAccount(secret, salt);
      return manager.address;
    },
  };

  const schema = WorkerWalletSchema as ApiSchema;
  const listener = new NodeListener();
  const server = new TransportServer<{ fn: string; args: string }>(listener, async msg => {
    if (!schemaHasMethod(schema, msg.fn)) {
      throw new Error(`Unknown method: ${msg.fn}`);
    }
    const jsonParams = JSON.parse(msg.args) as unknown[];
    const args = await parseWithOptionals(jsonParams, schema[msg.fn].parameters());
    const handler = handlers[msg.fn];
    const result = handler ? await handler(...args) : await (wallet as any)[msg.fn](...args);
    return jsonStringify(result);
  });
  server.start();
} catch (err: unknown) {
  logger.error('Worker wallet initialization failed', { error: err instanceof Error ? err.stack : String(err) });
  process.exit(1);
}
