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
      l2ProtocolContractsTreeRoot: Fr.random().toString(),
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
        l2ProtocolContractsTreeRoot: Fr.random().toString(),
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
  });
});
