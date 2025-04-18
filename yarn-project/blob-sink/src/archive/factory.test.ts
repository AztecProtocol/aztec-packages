import type { BlobSinkArchiveApiConfig } from './config.js';
import { createBlobArchiveClient } from './factory.js';

describe('BlobscanArchiveClient factory', () => {
  it.each<[string, BlobSinkArchiveApiConfig, boolean, string]>([
    ['empty config', {}, false, ''],
    ['random chain, no custom URL', { l1ChainId: 23478 }, false, ''],
    [
      'random chain, custom URL',
      { l1ChainId: 23478, archiveApiUrl: 'https://example.com' },
      true,
      'https://example.com/',
    ],
    ['ETH mainnet default URL', { l1ChainId: 1 }, true, 'https://api.blobscan.com/'],
    ['ETH mainnet custom URL', { l1ChainId: 1, archiveApiUrl: 'https://example.com' }, true, 'https://example.com/'],
    ['Sepolia default URL', { l1ChainId: 11155111 }, true, 'https://api.sepolia.blobscan.com/'],
    ['Seplia custom URL', { l1ChainId: 11155111, archiveApiUrl: 'https://example.com' }, true, 'https://example.com/'],
  ])('can instantiate a client: %s', (_, cfg, clientExpected, expectedBaseUrl) => {
    const client = createBlobArchiveClient(cfg);
    if (clientExpected) {
      expect(client).toBeDefined();
      expect(client!.getBaseUrl()).toEqual(expectedBaseUrl);
    } else {
      expect(client).not.toBeDefined();
    }
  });
});
