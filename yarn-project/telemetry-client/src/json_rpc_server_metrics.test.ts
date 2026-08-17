import type Koa from 'koa';

import {
  type JsonRpcRejectionReason,
  type JsonRpcServerMetrics,
  getOtelJsonRpcServerMetricsMiddleware,
} from './json_rpc_server_metrics.js';

describe('getOtelJsonRpcServerMetricsMiddleware', () => {
  const cases: Array<{
    name: string;
    status: number;
    response: unknown;
    expected: JsonRpcRejectionReason[];
  }> = [
    {
      name: 'unauthorized responses',
      status: 401,
      response: { error: { code: -32000 } },
      expected: ['unauthorized'],
    },
    {
      name: 'parse errors',
      status: 400,
      response: { error: { code: -32700 } },
      expected: ['parse_error'],
    },
    {
      name: 'invalid requests',
      status: 400,
      response: { error: { code: -32600 } },
      expected: ['invalid_request'],
    },
    {
      name: 'unknown methods',
      status: 400,
      response: { error: { code: -32601 } },
      expected: ['method_not_found'],
    },
    {
      name: 'bad requests',
      status: 400,
      response: { error: { code: -32000 } },
      expected: ['bad_request'],
    },
    {
      name: 'internal errors',
      status: 500,
      response: { error: { code: -32603 } },
      expected: ['internal_error'],
    },
    {
      name: 'internal errors in successful batch envelopes',
      status: 200,
      response: [{ error: { code: -32601 } }, { error: { code: -32603 } }],
      expected: ['method_not_found', 'internal_error'],
    },
    {
      name: 'dispatched handler errors',
      status: 400,
      response: { error: { code: -32702 } },
      expected: [],
    },
  ];

  it.each(cases)('records $name', async ({ status, response, expected }) => {
    const reasons: JsonRpcRejectionReason[] = [];
    const metrics: Pick<JsonRpcServerMetrics, 'recordBatch' | 'recordRejectedRequest'> = {
      recordBatch: () => undefined,
      recordRejectedRequest: reason => reasons.push(reason),
    };
    const middleware = getOtelJsonRpcServerMetricsMiddleware(() => metrics);
    const ctx = { status, body: response, request: {} } as Koa.Context;

    await middleware(ctx, () => Promise.resolve(undefined));

    expect(reasons).toEqual(expected);
  });
});
