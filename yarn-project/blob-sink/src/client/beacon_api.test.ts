import { SecretValue } from '@aztec/foundation/config';

import { getBeaconNodeFetchOptions } from './beacon_api.js';
import type { BlobSinkConfig } from './config.js';

describe('getBeaconNodeFetchOptions', () => {
  const mockConfig: BlobSinkConfig = {};

  describe('URL construction', () => {
    it('should construct URL from string base URL', () => {
      const result = getBeaconNodeFetchOptions('http://localhost:3000', '/api/v1/blobs', mockConfig);
      expect(result.url.href).toBe('http://localhost:3000/api/v1/blobs');
    });

    it('should handle base URLs with paths - absolute API replaces path', () => {
      const result = getBeaconNodeFetchOptions('http://localhost:3000/base', '/api/v1/blobs', mockConfig);
      expect(result.url.href).toBe('http://localhost:3000/api/v1/blobs');
    });

    it('should handle base URLs with paths - relative API appends to path', () => {
      const result = getBeaconNodeFetchOptions('http://localhost:3000/base/', 'api/v1/blobs', mockConfig);
      expect(result.url.href).toBe('http://localhost:3000/base/api/v1/blobs');
    });
  });

  describe('search params preservation', () => {
    it('should preserve search params from string base URL', () => {
      const result = getBeaconNodeFetchOptions(
        'http://localhost:3000?existing=value&another=param',
        '/api/v1/blobs',
        mockConfig,
      );

      expect(result.url.searchParams.get('existing')).toBe('value');
      expect(result.url.searchParams.get('another')).toBe('param');
      expect(result.url.href).toBe('http://localhost:3000/api/v1/blobs?existing=value&another=param');
    });
  });

  describe('API key as query parameter', () => {
    it('should add API key as query parameter when no header is specified', () => {
      const config: BlobSinkConfig = {
        l1ConsensusHostApiKeys: [new SecretValue('test-api-key')],
      };

      const result = getBeaconNodeFetchOptions('http://localhost:3000', '/api/v1/blobs', config, 0);

      expect(result.url.searchParams.get('key')).toBe('test-api-key');
      expect(result.url.href).toBe('http://localhost:3000/api/v1/blobs?key=test-api-key');
      expect(result.headers).toBeUndefined();
    });

    it('should add API key to existing search params', () => {
      const config: BlobSinkConfig = {
        l1ConsensusHostApiKeys: [new SecretValue('test-api-key')],
      };

      const result = getBeaconNodeFetchOptions('http://localhost:3000?existing=value', '/api/v1/blobs', config, 0);

      expect(result.url.searchParams.get('existing')).toBe('value');
      expect(result.url.searchParams.get('key')).toBe('test-api-key');
      expect(result.url.href).toBe('http://localhost:3000/api/v1/blobs?existing=value&key=test-api-key');
    });

    it('should use correct API key based on index', () => {
      const config: BlobSinkConfig = {
        l1ConsensusHostApiKeys: [
          new SecretValue('first-key'),
          new SecretValue('second-key'),
          new SecretValue('third-key'),
        ],
      };

      const result1 = getBeaconNodeFetchOptions('http://localhost:3000', '/api/v1/blobs', config, 0);
      expect(result1.url.searchParams.get('key')).toBe('first-key');

      const result2 = getBeaconNodeFetchOptions('http://localhost:3000', '/api/v1/blobs', config, 1);
      expect(result2.url.searchParams.get('key')).toBe('second-key');

      const result3 = getBeaconNodeFetchOptions('http://localhost:3000', '/api/v1/blobs', config, 2);
      expect(result3.url.searchParams.get('key')).toBe('third-key');
    });
  });

  describe('API key as header', () => {
    it('should add API key as header when header name is specified', () => {
      const config: BlobSinkConfig = {
        l1ConsensusHostApiKeys: [new SecretValue('test-api-key')],
        l1ConsensusHostApiKeyHeaders: ['X-API-Key'],
      };

      const result = getBeaconNodeFetchOptions('http://localhost:3000', '/api/v1/blobs', config, 0);

      expect(result.url.searchParams.has('key')).toBe(false);
      expect(result.url.href).toBe('http://localhost:3000/api/v1/blobs');
      expect(result.headers).toEqual({
        'X-API-Key': 'test-api-key',
      });
    });

    it('should use correct header name and API key based on index', () => {
      const config: BlobSinkConfig = {
        l1ConsensusHostApiKeys: [new SecretValue('first-key'), new SecretValue('second-key')],
        l1ConsensusHostApiKeyHeaders: ['X-API-Key-1', 'X-API-Key-2'],
      };

      const result1 = getBeaconNodeFetchOptions('http://localhost:3000', '/api/v1/blobs', config, 0);
      expect(result1.headers).toEqual({
        'X-API-Key-1': 'first-key',
      });

      const result2 = getBeaconNodeFetchOptions('http://localhost:3000', '/api/v1/blobs', config, 1);
      expect(result2.headers).toEqual({
        'X-API-Key-2': 'second-key',
      });
    });

    it('should preserve existing search params when using headers', () => {
      const config: BlobSinkConfig = {
        l1ConsensusHostApiKeys: [new SecretValue('test-api-key')],
        l1ConsensusHostApiKeyHeaders: ['Authorization'],
      };

      const result = getBeaconNodeFetchOptions('http://localhost:3000?existing=value', '/api/v1/blobs', config, 0);

      expect(result.url.searchParams.get('existing')).toBe('value');
      expect(result.url.searchParams.has('key')).toBe(false);
      expect(result.url.href).toBe('http://localhost:3000/api/v1/blobs?existing=value');
      expect(result.headers).toEqual({
        Authorization: 'test-api-key',
      });
    });
  });

  describe('edge cases', () => {
    it('should handle URLs with special characters', () => {
      const result = getBeaconNodeFetchOptions(
        'http://localhost:3000?query=hello%20world',
        '/api/v1/blobs',
        mockConfig,
      );

      expect(result.url.searchParams.get('query')).toBe('hello world');
    });

    it('should handle complex URL combinations', () => {
      const config: BlobSinkConfig = {
        l1ConsensusHostApiKeys: [new SecretValue('complex-key')],
        l1ConsensusHostApiKeyHeaders: ['Authorization'],
      };

      const result = getBeaconNodeFetchOptions(
        'https://api.example.com:8080/base?existing=value&another=test',
        '/beacon/api/v1/blobs',
        config,
        0,
      );

      expect(result.url.href).toBe('https://api.example.com:8080/beacon/api/v1/blobs?existing=value&another=test');
      expect(result.headers).toEqual({
        Authorization: 'complex-key',
      });
    });
  });
});
