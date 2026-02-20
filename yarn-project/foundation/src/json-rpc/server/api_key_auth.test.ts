import Koa from 'koa';
import request from 'supertest';

import { getApiKeyAuthMiddleware, sha256Hash } from './api_key_auth.js';

describe('getApiKeyAuthMiddleware', () => {
  const RAW_API_KEY = 'test-api-key-for-unit-tests-1234567890abcdef';
  const API_KEY_HASH = sha256Hash(RAW_API_KEY);

  let app: Koa;

  beforeEach(() => {
    app = new Koa();
    app.use(getApiKeyAuthMiddleware(API_KEY_HASH));
    // A simple handler that returns 200 if middleware passes
    app.use((ctx: Koa.Context) => {
      ctx.status = 200;
      ctx.body = { jsonrpc: '2.0', result: 'ok' };
    });
  });

  const sendPost = (headers: Record<string, string> = {}) =>
    request(app.callback())
      .post('/')
      .send({ jsonrpc: '2.0', method: 'test', params: [], id: 1 })
      .set({ 'content-type': 'application/json', ...headers });

  describe('x-api-key header', () => {
    it('allows request with valid API key', async () => {
      const response = await sendPost({ 'x-api-key': RAW_API_KEY });
      expect(response.status).toBe(200);
      expect(response.body.result).toBe('ok');
    });

    it('rejects request with invalid API key', async () => {
      const response = await sendPost({ 'x-api-key': 'wrong-key' });
      expect(response.status).toBe(401);
      expect(response.body.error.message).toContain('Unauthorized');
    });
  });

  describe('Authorization: Bearer header', () => {
    it('allows request with valid Bearer token', async () => {
      const response = await sendPost({ Authorization: `Bearer ${RAW_API_KEY}` });
      expect(response.status).toBe(200);
      expect(response.body.result).toBe('ok');
    });

    it('allows case-insensitive Bearer prefix', async () => {
      const response = await sendPost({ Authorization: `bearer ${RAW_API_KEY}` });
      expect(response.status).toBe(200);
    });

    it('rejects request with invalid Bearer token', async () => {
      const response = await sendPost({ Authorization: 'Bearer wrong-key' });
      expect(response.status).toBe(401);
      expect(response.body.error.message).toContain('Unauthorized');
    });
  });

  describe('missing credentials', () => {
    it('rejects request with no auth headers', async () => {
      const response = await sendPost();
      expect(response.status).toBe(401);
      expect(response.body.error.message).toContain('Unauthorized');
    });

    it('returns a JSON-RPC error envelope', async () => {
      const response = await sendPost();
      expect(response.body).toMatchObject({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32000 },
      });
    });
  });

  describe('health check bypass', () => {
    it('allows GET /status without any auth', async () => {
      const response = await request(app.callback()).get('/status');
      // The status endpoint itself isn't handled by our simple handler,
      // but the important thing is the middleware does NOT return 401.
      expect(response.status).not.toBe(401);
    });

    it('still requires auth for POST /status', async () => {
      const response = await request(app.callback()).post('/status').send({});
      expect(response.status).toBe(401);
    });
  });
});
