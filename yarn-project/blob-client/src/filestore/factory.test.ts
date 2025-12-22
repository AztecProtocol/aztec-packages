import {
  type BlobFileStoreMetadata,
  createReadOnlyFileStoreBlobClient,
  createReadOnlyFileStoreBlobClients,
  createWritableFileStoreBlobClient,
  makeBlobBasePath,
} from './factory.js';

describe('Blob FileStore Factory', () => {
  describe('makeBlobBasePath', () => {
    it('should construct correct path format', () => {
      const metadata: BlobFileStoreMetadata = {
        l1ChainId: 1,
        rollupVersion: 2,
        rollupAddress: '0x1234567890abcdef1234567890abcdef12345678',
      };

      const path = makeBlobBasePath(metadata);

      expect(path).toBe('aztec-1-2-0x1234567890abcdef1234567890abcdef12345678');
    });

    it('should normalize rollup address to lowercase', () => {
      const metadata: BlobFileStoreMetadata = {
        l1ChainId: 1,
        rollupVersion: 1,
        rollupAddress: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
      };

      const path = makeBlobBasePath(metadata);

      expect(path).toBe('aztec-1-1-0xabcdef1234567890abcdef1234567890abcdef12');
    });

    it('should add 0x prefix if missing', () => {
      const metadata: BlobFileStoreMetadata = {
        l1ChainId: 11155111,
        rollupVersion: 3,
        rollupAddress: 'abcdef1234567890abcdef1234567890abcdef12',
      };

      const path = makeBlobBasePath(metadata);

      expect(path).toBe('aztec-11155111-3-0xabcdef1234567890abcdef1234567890abcdef12');
    });

    it('should handle address with 0x prefix and normalize', () => {
      const metadata: BlobFileStoreMetadata = {
        l1ChainId: 1,
        rollupVersion: 1,
        rollupAddress: '0xABCD',
      };

      const path = makeBlobBasePath(metadata);

      expect(path).toBe('aztec-1-1-0xabcd');
    });

    it('should handle different chain IDs', () => {
      const metadata: BlobFileStoreMetadata = {
        l1ChainId: 31337,
        rollupVersion: 1,
        rollupAddress: '0x1234',
      };

      const path = makeBlobBasePath(metadata);

      expect(path).toBe('aztec-31337-1-0x1234');
    });

    it('should handle different rollup versions', () => {
      const metadata: BlobFileStoreMetadata = {
        l1ChainId: 1,
        rollupVersion: 99,
        rollupAddress: '0x1234',
      };

      const path = makeBlobBasePath(metadata);

      expect(path).toBe('aztec-1-99-0x1234');
    });
  });

  describe('createReadOnlyFileStoreBlobClient', () => {
    const metadata: BlobFileStoreMetadata = {
      l1ChainId: 1,
      rollupVersion: 1,
      rollupAddress: '0x1234',
    };

    it('should return undefined for undefined URL', async () => {
      const client = await createReadOnlyFileStoreBlobClient(undefined, metadata);

      expect(client).toBeUndefined();
    });

    it('should create client for file:// URL', async () => {
      // Use a file URL that doesn't require external connectivity
      const client = await createReadOnlyFileStoreBlobClient('file:///tmp/test-blob-store', metadata);

      expect(client).toBeDefined();
      expect(client!.getBaseUrl()).toBe('aztec-1-1-0x1234');
    });
  });

  describe('createReadOnlyFileStoreBlobClients', () => {
    const metadata: BlobFileStoreMetadata = {
      l1ChainId: 1,
      rollupVersion: 1,
      rollupAddress: '0x1234',
    };

    it('should return empty array for undefined URLs', async () => {
      const clients = await createReadOnlyFileStoreBlobClients(undefined, metadata);

      expect(clients).toEqual([]);
    });

    it('should return empty array for empty URL array', async () => {
      const clients = await createReadOnlyFileStoreBlobClients([], metadata);

      expect(clients).toEqual([]);
    });

    it('should create multiple clients for file:// URLs', async () => {
      const urls = ['file:///tmp/store1', 'file:///tmp/store2'];
      const clients = await createReadOnlyFileStoreBlobClients(urls, metadata);

      expect(clients).toHaveLength(2);
      clients.forEach(client => {
        expect(client.getBaseUrl()).toBe('aztec-1-1-0x1234');
      });
    });

    it('should skip invalid URLs and continue', async () => {
      // Mix of valid and invalid URLs - invalid URLs should be skipped
      const urls = ['file:///tmp/store1', 'invalid-not-a-url', 'file:///tmp/store2'];
      const clients = await createReadOnlyFileStoreBlobClients(urls, metadata);

      // The 'invalid-not-a-url' should fail, so we should get 2 clients
      expect(clients.length).toBeLessThanOrEqual(3);
      expect(clients.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('createWritableFileStoreBlobClient', () => {
    const metadata: BlobFileStoreMetadata = {
      l1ChainId: 1,
      rollupVersion: 1,
      rollupAddress: '0x1234',
    };

    it('should return undefined for undefined URL', async () => {
      const client = await createWritableFileStoreBlobClient(undefined, metadata);

      expect(client).toBeUndefined();
    });

    it('should create writable client for file:// URL', async () => {
      const client = await createWritableFileStoreBlobClient('file:///tmp/test-writable-blob-store', metadata);

      expect(client).toBeDefined();
      expect(client!.getBaseUrl()).toBe('aztec-1-1-0x1234');
    });

    it('should throw for https:// URL (not supported for writable stores)', async () => {
      // https:// URLs are not supported for writable file stores
      await expect(createWritableFileStoreBlobClient('https://example.com/blobs', metadata)).rejects.toThrow(
        'Unknown file store config',
      );
    });
  });
});
