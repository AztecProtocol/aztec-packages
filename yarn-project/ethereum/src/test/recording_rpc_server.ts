import { type Server, createServer } from 'node:http';

/** A JSON-RPC endpoint that records the method of every request it receives. */
export type RecordingRpcServer = {
  /** URL the server listens on. */
  url: string;
  /** Methods of the JSON-RPC requests received so far, in arrival order. */
  methods: string[];
  /** Stops the server. */
  close: () => Promise<void>;
};

/**
 * Starts a JSON-RPC server that records the method of every request it receives, so tests can assert on what a
 * client actually put on the wire. Requests are forwarded to `forwardTo` when given; otherwise the server answers
 * `eth_chainId` with the anvil chain id and rejects anything else.
 */
export async function startRecordingRpcServer(opts: { forwardTo?: string } = {}): Promise<RecordingRpcServer> {
  const methods: string[] = [];

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      void (async () => {
        const body = Buffer.concat(chunks).toString();
        const parsed: unknown = body.length > 0 ? JSON.parse(body) : undefined;
        const requests = Array.isArray(parsed) ? parsed : [parsed];
        for (const request of requests) {
          const method = (request as { method?: string } | undefined)?.method;
          if (typeof method === 'string') {
            methods.push(method);
          }
        }

        if (opts.forwardTo) {
          const response = await fetch(opts.forwardTo, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
          });
          res.writeHead(response.status, { 'content-type': 'application/json' });
          res.end(await response.text());
          return;
        }

        const id = (requests[0] as { id?: number } | undefined)?.id ?? 1;
        const result =
          methods[methods.length - 1] === 'eth_chainId'
            ? { jsonrpc: '2.0', id, result: '0x7a69' }
            : { jsonrpc: '2.0', id, error: { code: -32601, message: 'method not handled by test server' } };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      })();
    });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected recording RPC server to listen on a TCP port');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    methods,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}
