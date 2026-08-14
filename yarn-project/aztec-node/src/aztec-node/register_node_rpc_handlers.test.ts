import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createSafeJsonRpcClient } from '@aztec/foundation/json-rpc/client';
import {
  type NamespacedApiHandlers,
  createNamespacedSafeJsonRpcServer,
  startHttpRpcServer,
} from '@aztec/foundation/json-rpc/server';
import type { L2Tips } from '@aztec/stdlib/block';
import { AztecNodeAdminApiSchema, AztecNodeApiSchema, AztecNodeDebugApiSchema } from '@aztec/stdlib/interfaces/client';
import { ArchiverApiSchema, ArchiverPublicApiSchema, P2PApiSchema } from '@aztec/stdlib/interfaces/server';
import type { ApiSchemaFor } from '@aztec/stdlib/schemas';

import { registerAztecNodeRpcHandlers } from './register_node_rpc_handlers.js';
import type { AztecNodeService } from './server.js';

type GetChainTipsOnly = { getChainTips(): Promise<L2Tips> };

const GetChainTipsOnlySchema: ApiSchemaFor<GetChainTipsOnly> = {
  getChainTips: AztecNodeApiSchema.getChainTips,
};

const p2p = {};
const archiver = {};

const mockNode = {
  tryGetP2P: () => p2p,
  getArchiverApi: () => archiver,
  getChainTips(): Promise<L2Tips> {
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
  },
} as unknown as AztecNodeService;

describe('registerAztecNodeRpcHandlers', () => {
  it('registers aztec namespaces along with legacy aliases', () => {
    const services: NamespacedApiHandlers = {};
    const adminServices: NamespacedApiHandlers = {};

    registerAztecNodeRpcHandlers(mockNode, services, adminServices, { debug: true });

    expect(services.aztec).toEqual([mockNode, AztecNodeApiSchema]);
    expect(services.node).toBe(services.aztec);
    expect(services.p2p).toEqual([p2p, P2PApiSchema]);
    expect(services.archiver).toEqual([archiver, ArchiverPublicApiSchema]);
    expect(services.aztecDebug).toEqual([mockNode, AztecNodeDebugApiSchema]);
    expect(services.nodeDebug).toBe(services.aztecDebug);
    expect(adminServices.aztecAdmin).toEqual([mockNode, AztecNodeAdminApiSchema]);
    expect(adminServices.nodeAdmin).toBe(adminServices.aztecAdmin);
  });

  it('skips the p2p namespace on a node with no p2p stack', () => {
    const followerNode = { ...mockNode, tryGetP2P: () => undefined } as unknown as AztecNodeService;
    const services: NamespacedApiHandlers = {};

    registerAztecNodeRpcHandlers(followerNode, services);

    expect(services.p2p).toBeUndefined();
    expect(services.aztec).toEqual([followerNode, AztecNodeApiSchema]);
    expect(services.archiver).toEqual([archiver, ArchiverPublicApiSchema]);
  });

  it('skips the archiver namespace on a node with no archiver', () => {
    const remoteArchiverNode = { ...mockNode, getArchiverApi: () => undefined } as unknown as AztecNodeService;
    const services: NamespacedApiHandlers = {};

    registerAztecNodeRpcHandlers(remoteArchiverNode, services);

    expect(services.archiver).toBeUndefined();
  });

  it('does not expose the archiver write and sync-control methods', () => {
    const services: NamespacedApiHandlers = {};

    registerAztecNodeRpcHandlers(mockNode, services);

    const [, schema] = services.archiver!;
    // The namespace is served unauthenticated next to aztec_*, so it must stay read-only.
    expect(Object.keys(schema)).not.toContain('syncImmediate');
    expect(Object.keys(schema)).not.toContain('registerContractFunctionSignatures');
    expect(Object.keys(ArchiverApiSchema)).toContain('syncImmediate');
  });

  it('skips debug namespaces unless requested', () => {
    const services: NamespacedApiHandlers = {};

    registerAztecNodeRpcHandlers(mockNode, services);

    expect(services.aztecDebug).toBeUndefined();
    expect(services.nodeDebug).toBeUndefined();
  });

  it('serves node_* methods as aliases of aztec_*', async () => {
    const services: NamespacedApiHandlers = {};
    registerAztecNodeRpcHandlers(mockNode, services);

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
    const body = (await response.json()) as { result: L2Tips };
    expect(body.result).toEqual(expected);

    httpServer.close();
  });
});
