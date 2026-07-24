import { DefaultWaitOpts } from '@aztec/aztec.js/contracts';
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import type { SendOptions } from '@aztec/aztec.js/wallet';
import { BackendType, BarretenbergSync } from '@aztec/bb.js';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';
import type { ApiSchema, Fq, Fr } from '@aztec/foundation/schemas';
import { getSchemaParameters, parseWithOptionals, schemaHasMethod } from '@aztec/foundation/schemas';
import { NodeListener, TransportServer } from '@aztec/foundation/transport';
import { ExecutionPayload, Tx } from '@aztec/stdlib/tx';

import { workerData } from 'worker_threads';

import { TestWallet } from './test_wallet.js';
import { WorkerWalletSchema } from './worker_wallet_schema.js';

const logger = createLogger('e2e:test-wallet:worker');

try {
  const { nodeUrl, pxeConfig } = workerData as { nodeUrl: string; pxeConfig?: Record<string, unknown> };

  logger.info('Initializing worker wallet', { nodeUrl });
  const node = createAztecNodeClient(nodeUrl);
  // Worker sync bb use is limited to crypto and proof serialization helpers.
  await BarretenbergSync.initSingleton({ backend: BackendType.Wasm });
  const wallet = await TestWallet.create(node, pxeConfig);
  // Worker wallets are only used by spartan tests against remote JSON-RPC nodes: keep the 1s poll cadence.
  wallet.setDefaultWaitInterval(DefaultWaitOpts.interval);
  logger.info('Worker wallet initialized');

  const customMethods = {
    proveTx: async (exec: ExecutionPayload, opts: Omit<SendOptions, 'wait'>) => {
      const provenTx = await wallet.proveTx(exec, opts);
      return new Tx(
        provenTx.getTxHash(),
        provenTx.data,
        provenTx.chonkProof,
        provenTx.contractClassLogFields,
        provenTx.publicFunctionCalldata,
      );
    },
    registerAccount: async (secret: Fr, salt: Fr, signingKey: Fq) => {
      const manager = await wallet.createSchnorrAccount(secret, salt, signingKey);
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
    const args: any[] = await parseWithOptionals(jsonParams, getSchemaParameters(schema[msg.fn]));
    // we have to erase the fn type in order to be able to spread ...args
    const handler: ((...args: any[]) => Promise<any>) | undefined =
      msg.fn in customMethods ? customMethods[msg.fn as keyof typeof customMethods] : undefined;
    const result = handler ? await handler(...args) : await (wallet as any)[msg.fn](...args);
    return jsonStringify(result);
  });
  server.start();
} catch (err: unknown) {
  logger.error('Worker wallet initialization failed', { error: err instanceof Error ? err.stack : String(err) });
  process.exit(1);
}
