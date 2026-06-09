import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createSafeJsonRpcClient } from '@aztec/foundation/json-rpc/client';
import {
  type NamespacedApiHandlers,
  createNamespacedSafeJsonRpcServer,
  makeHandler,
  startHttpRpcServer,
} from '@aztec/foundation/json-rpc/server';

import type { ApiSchemaFor } from '../schemas/schemas.js';
import { AztecNodeApiSchema } from './aztec-node.js';
import type { ChainTips } from './chain_tips.js';
import { addLegacyNodeRpcNamespaces } from './legacy_node_rpc_namespaces.js';

type GetChainTipsOnly = { getChainTips(): Promise<ChainTips> };

const GetChainTipsOnlySchema: ApiSchemaFor<GetChainTipsOnly> = {
  getChainTips: AztecNodeApiSchema.getChainTips,
};

class MockNode implements GetChainTipsOnly {
  getChainTips(): Promise<ChainTips> {
    const tipId = {
      block: { number: BlockNumber(1), hash: `0x01` },
      checkpoint: { number: CheckpointNumber(1), hash: `0x01` },
    };
    return Promise.resolve({
      proposed: { number: BlockNumber(1), hash: `0x01` },
      checkpointed: tipId,
      proven: tipId,
      finalized: tipId,
    });
  }
}

describe('legacy node RPC namespaces', () => {
  it('aliases node to aztec', () => {
    const aztec = [{}, AztecNodeApiSchema] as NamespacedApiHandlers[string];
    const services: NamespacedApiHandlers = { aztec };
    addLegacyNodeRpcNamespaces(services);
    expect(services.node).toBe(aztec);
  });

  it('serves node_* methods as aliases of aztec_*', async () => {
    const services: NamespacedApiHandlers = {
      aztec: makeHandler(new MockNode(), GetChainTipsOnlySchema),
    };
    addLegacyNodeRpcNamespaces(services);

    const rpcServer = createNamespacedSafeJsonRpcServer(services);
    const httpServer = await startHttpRpcServer(rpcServer, { port: 0 });
    const url = `http://127.0.0.1:${httpServer.port}`;

    const aztecClient = createSafeJsonRpcClient<GetChainTipsOnly>(url, GetChainTipsOnlySchema, {
      namespaceMethods: 'aztec',
    });
    const legacyClient = createSafeJsonRpcClient<GetChainTipsOnly>(url, GetChainTipsOnlySchema, {
      namespaceMethods: 'node',
    });

    const expected = await aztecClient.getChainTips();
    expect(await legacyClient.getChainTips()).toEqual(expected);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: jsonStringify({ jsonrpc: '2.0', id: 1, method: 'node_getChainTips', params: [] }),
    });
    const body = (await response.json()) as { result: ChainTips };
    expect(body.result).toEqual(expected);

    httpServer.close();
  });
});
