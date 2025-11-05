import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createSafeJsonRpcClient } from '@aztec/foundation/json-rpc/client';
import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';

import { z } from 'zod';

import type { ApiSchemaFor } from '../schemas/index.js';
import {
  type ComponentsVersions,
  checkCompressedComponentVersion,
  compressComponentVersions,
  getVersioningMiddleware,
  getVersioningResponseHandler,
  validatePartialComponentVersionsMatch,
} from './versioning.js';

describe('versioning', () => {
  let versions: ComponentsVersions;

  beforeAll(() => {
    versions = {
      l1ChainId: 1,
      l1RollupAddress: EthAddress.random(),
      rollupVersion: 3,
      l2ProtocolContractsHash: Fr.random().toString(),
      l2CircuitsVkTreeRoot: Fr.random().toString(),
    };
  });

  describe('comparing', () => {
    it('compresses and checks', () => {
      checkCompressedComponentVersion(compressComponentVersions(versions), versions);
    });

    it('throws on mismatch in compressed', () => {
      const compressed = compressComponentVersions(versions);
      const expected = { ...versions, l1ChainId: 2 };
      expect(() => checkCompressedComponentVersion(compressed, expected)).toThrow(/L1 chain/);
    });

    it('validates partial versions', () => {
      const partial = { l1ChainId: 1, rollupVersion: 3 };
      validatePartialComponentVersionsMatch(partial, versions);
    });

    it('throws on mismatch for partial versions', () => {
      const partial = { l1ChainId: 10, rollupVersion: 3 };
      expect(() => validatePartialComponentVersionsMatch(partial, versions)).toThrow(/l1ChainId/);
    });
  });

  describe('json-rpc', () => {
    type TestApi = { get: () => Promise<number> };
    const TestApiSchema: ApiSchemaFor<TestApi> = { get: z.function().returns(z.number()) };

    let context: JsonRpcTestContext<TestApi>;
    let versions: Partial<ComponentsVersions>;

    beforeAll(async () => {
      versions = {
        l1ChainId: 1,
        l1RollupAddress: EthAddress.random(),
        rollupVersion: undefined,
        l2ProtocolContractsHash: Fr.random().toString(),
        l2CircuitsVkTreeRoot: Fr.random().toString(),
      };

      const handler = { get: () => Promise.resolve(1) };
      context = await createJsonRpcTestSetup<TestApi>(
        handler,
        TestApiSchema,
        { middlewares: [getVersioningMiddleware(versions)] },
        { onResponse: getVersioningResponseHandler(versions) },
      );
    });

    afterAll(() => {
      context.httpServer.close();
    });

    it('passes versioning headers', async () => {
      const result = await context.client.get();
      expect(result).toBe(1);
    });

    it('throws on mismatch', async () => {
      const client = createSafeJsonRpcClient(context.url, TestApiSchema, {
        onResponse: getVersioningResponseHandler({ ...versions, l1ChainId: 2 }),
      });
      await expect(client.get()).rejects.toThrow(/chain/i);
    });

    it('passes if missing on server', async () => {
      const client = createSafeJsonRpcClient(context.url, TestApiSchema, {
        onResponse: getVersioningResponseHandler({ ...versions, rollupVersion: 5 }),
      });
      expect(await client.get()).toEqual(1);
    });

    it('passes if missing on client', async () => {
      const client = createSafeJsonRpcClient(context.url, TestApiSchema, {
        onResponse: getVersioningResponseHandler({ ...versions, l1ChainId: undefined }),
      });
      expect(await client.get()).toEqual(1);
    });

    it('throws ComponentsVersionsError on version mismatch even when request causes validation error', async () => {
      // Create a schema that expects a string parameter
      type TestApiWithParam = { getWithParam: (value: string) => Promise<number> };
      const TestApiWithParamSchema: ApiSchemaFor<TestApiWithParam> = {
        getWithParam: z.function().args(z.string()).returns(z.number()),
      };

      // Server handler with correct version
      const handler = { getWithParam: (value: string) => Promise.resolve(value.length) };
      const serverContext = await createJsonRpcTestSetup<TestApiWithParam>(
        handler,
        TestApiWithParamSchema,
        { middlewares: [getVersioningMiddleware(versions)] },
        {},
      );

      try {
        // Client with mismatched version - should throw ComponentsVersionsError
        // even if the request would cause a Zod validation error
        const client = createSafeJsonRpcClient(serverContext.url, TestApiWithParamSchema, {
          onResponse: getVersioningResponseHandler({ ...versions, l1ChainId: 999 }),
        });

        // Send a request that would normally cause a Zod error (passing number instead of string)
        // But we should get a version mismatch error instead of a Zod validation error
        try {
          await (client.getWithParam as any)(123);
          fail('Expected error to be thrown');
        } catch (err: any) {
          // Verify we get a version error, not a Zod validation error
          expect(err.message).toMatch(/Expected component version/);
          expect(err.message).toMatch(/l1ChainId/);
          expect(err.message).not.toMatch(/validation/i);
          expect(err.name).toBe('ComponentsVersionsError');
        }
      } finally {
        serverContext.httpServer.close();
      }
    });
  });
});
