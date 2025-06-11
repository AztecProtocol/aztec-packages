import type { BlobSinkArchiveApiConfig } from './config.js';
import { createBlobArchiveClient } from './factory.js';

describe('BlobscanArchiveClient factory', () => {
  it.each<[string, BlobSinkArchiveApiConfig, boolean, string | undefined]>([
    ['empty config', {}, false, undefined],
    ['random chain, no custom URL', { l1ChainId: 23478 }, false, undefined],
    [
      'random chain, custom URL',
      { l1ChainId: 23478, archiveApiUrl: 'https://example.com' },
      true,
      'https://example.com/',
    ],
    ['ETH mainnet no default URL', { l1ChainId: 1 }, false, undefined],
    ['ETH mainnet custom URL', { l1ChainId: 1, archiveApiUrl: 'https://example.com' }, true, 'https://example.com/'],
    ['Sepolia no default URL', { l1ChainId: 11155111 }, false, undefined],
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
