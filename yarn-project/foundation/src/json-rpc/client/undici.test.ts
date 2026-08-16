import { afterEach, describe, expect, it } from '@jest/globals';
import { once } from 'node:events';
import { type Server, createServer } from 'node:http';

import { Agent, type CookieJar, makeUndiciFetch } from './undici.js';

describe('Undici JSON-RPC fetch', () => {
  let agent: Agent | undefined;
  let server: Server | undefined;

  afterEach(async () => {
    await agent?.close();
    if (server?.listening) {
      server.close();
      await once(server, 'close');
    }
  });

  it('works without a cookie jar', async () => {
    server = createServer((_request, response) => response.end('{}'));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    agent = new Agent();

    await expect(makeUndiciFetch(agent)(getServerUrl(server), {})).resolves.toEqual({
      response: {},
      headers: expect.any(Headers),
    });
  });

  it('awaits an injected async cookie jar', async () => {
    const requestCookies: Array<string | undefined> = [];
    server = createServer((request, response) => {
      requestCookies.push(request.headers.cookie);
      response.setHeader('set-cookie', ['AWSALB=ordinary; Path=/', 'AWSALBCORS=cors; Path=/; SameSite=None; Secure']);
      response.end('{}');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const cookies: string[] = [];
    const cookieJar: CookieJar = {
      getCookieString: () => Promise.resolve(cookies.join('; ')),
      setCookie: async cookie => {
        await new Promise<void>(resolve => setImmediate(resolve));
        cookies.push(cookie.split(';', 1)[0]);
      },
    };
    agent = new Agent();
    const fetch = makeUndiciFetch(agent, cookieJar);
    const url = getServerUrl(server);

    await fetch(url, {});
    await fetch(url, {});

    expect(requestCookies).toEqual([undefined, 'AWSALB=ordinary; AWSALBCORS=cors']);
  });
});

function getServerUrl(server: Server): string {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected HTTP server to listen on a TCP port');
  }
  return `http://127.0.0.1:${address.port}/rpc`;
}
