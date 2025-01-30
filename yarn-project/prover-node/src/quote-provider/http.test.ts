import { L2Block } from '@aztec/circuit-types';
import { timesParallel } from '@aztec/foundation/collection';
import { promiseWithResolvers } from '@aztec/foundation/promise';

import { type Server, createServer } from 'http';
import { type AddressInfo } from 'net';

import { HttpQuoteProvider } from './http.js';

describe('HttpQuoteProvider', () => {
  let server: Server;
  let port: number;

  let status: number = 200;
  let response: any = {};
  let request: any = {};

  let provider: HttpQuoteProvider;
  let blocks: L2Block[];

  beforeAll(async () => {
    server = createServer({ keepAliveTimeout: 60000 }, (req, res) => {
      const chunks: Buffer[] = [];
      req
        .on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        })
        .on('end', () => {
          request = JSON.parse(Buffer.concat(chunks).toString());
        });

      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    });

    const { promise, resolve } = promiseWithResolvers();
    server.listen(0, '127.0.0.1', () => resolve(null));
    await promise;
    port = (server.address() as AddressInfo).port;
  });

  beforeEach(async () => {
    provider = new HttpQuoteProvider(`http://127.0.0.1:${port}`);
    blocks = await timesParallel(3, i => L2Block.random(i + 1, 4));
    response = { basisPointFee: 100, bondAmount: '100000000000000000000', validUntilSlot: '100' };
  });

  afterAll(() => {
    server?.close();
  });

  it('requests a quote sending epoch data', async () => {
    const quote = await provider.getQuote(1, blocks);

    expect(request).toEqual(
      expect.objectContaining({ epochNumber: 1, fromBlock: 1, toBlock: 3, txCount: 12, totalFees: expect.any(String) }),
    );

    expect(quote).toEqual({
      basisPointFee: response.basisPointFee,
      bondAmount: BigInt(response.bondAmount),
      validUntilSlot: BigInt(response.validUntilSlot),
    });
  });

  it('throws an error if the response is missing required fields', async () => {
    response = { basisPointFee: 100 };
    await expect(provider.getQuote(1, blocks)).rejects.toThrow(/Missing required fields/i);
  });

  it('throws an error if the response is not ok', async () => {
    status = 400;
    await expect(provider.getQuote(1, blocks)).rejects.toThrow(/Failed to fetch quote/i);
  });
});
