import { AztecNodeService, aztecNodeConfigMappings } from '@aztec/aztec-node';
import { getConfigFromMappings } from '@aztec/foundation/config';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';
import { type ApiSchema, parseWithOptionals, schemaHasMethod, schemas } from '@aztec/foundation/schemas';
import { NodeListener, TransportServer } from '@aztec/foundation/transport';
import { PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import type { GenesisData } from '@aztec/stdlib/world-state';
import { getConfigEnvVars as getTelemetryConfig, initTelemetryClient } from '@aztec/telemetry-client';

import { type MessagePort, workerData } from 'worker_threads';
import { z } from 'zod';

import { NodeWorkerSchema } from './node_worker_schema.js';
import { RemoteDateProvider } from './remote_date_provider.js';

const logger = createLogger('e2e:node-worker');

const GenesisDataSchema = z.object({
  prefilledPublicData: z.array(PublicDataTreeLeaf.schema),
  genesisTimestamp: schemas.BigInt,
});

type NodeWorkerData = {
  env: Record<string, string>;
  genesisJson: string | undefined;
  dateProviderPort: MessagePort;
  dontStartSequencer: boolean;
  dontStartProverNode: boolean;
};

try {
  const data = workerData as NodeWorkerData;

  const config = getConfigFromMappings(aztecNodeConfigMappings, data.env);
  const genesis: GenesisData | undefined = data.genesisJson
    ? GenesisDataSchema.parse(JSON.parse(data.genesisJson))
    : undefined;

  const dateProvider = new RemoteDateProvider(data.dateProviderPort);
  const telemetry = await initTelemetryClient(getTelemetryConfig());

  logger.verbose('Creating AztecNodeService in worker thread', {
    dontStartSequencer: data.dontStartSequencer,
    dontStartProverNode: data.dontStartProverNode,
    enableProverNode: config.enableProverNode,
    disableValidator: config.disableValidator,
  });

  const node = await AztecNodeService.createAndSync(
    config,
    { dateProvider, telemetry },
    { genesis, dontStartSequencer: data.dontStartSequencer, dontStartProverNode: data.dontStartProverNode },
  );

  logger.verbose('AztecNodeService ready in worker thread');

  const schema = NodeWorkerSchema as ApiSchema;
  const listener = new NodeListener();
  const server = new TransportServer<{ fn: string; args: string }>(listener, async msg => {
    if (!schemaHasMethod(schema, msg.fn)) {
      throw new Error(`Unknown method on node worker: ${msg.fn}`);
    }
    const jsonParams = JSON.parse(msg.args) as unknown[];
    const args: any[] = await parseWithOptionals(jsonParams, schema[msg.fn].parameters());
    const result = await (node as any)[msg.fn](...args);
    // `stop` drains native resources (world-state thread pool, LMDB handles, etc.).
    // Exit the worker after the response flushes so the main thread doesn't have to
    // `worker.terminate()` a live Napi::Env and orphan C++ threads.
    if (msg.fn === 'stop') {
      setImmediate(() => process.exit(0));
    }
    return jsonStringify(result);
  });
  server.start();
} catch (err: unknown) {
  logger.error('Node worker initialization failed', { error: err instanceof Error ? err.stack : String(err) });
  process.exit(1);
}
