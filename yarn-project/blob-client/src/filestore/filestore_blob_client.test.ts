import { Blob } from '@aztec/blob-lib';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { FileStore, ReadOnlyFileStore } from '@aztec/stdlib/file-store';

import { inboundTransform, outboundTransform } from '../encoding/index.js';
import { FileStoreBlobClient } from './filestore_blob_client.js';

class MockFileStore implements FileStore {
  private files = new Map<string, Buffer>();

  save(path: string, data: Buffer): Promise<string> {
    this.files.set(path, data);
    return Promise.resolve(path);
  }

  upload(_destPath: string, _srcPath: string): Promise<string> {
    return Promise.reject(new Error('Not implemented'));
  }

  read(path: string): Promise<Buffer> {
    const data = this.files.get(path);
    if (!data) {
      return Promise.reject(new Error(`File not found: ${path}`));
    }
    return Promise.resolve(data);
  }

  download(_pathOrUrl: string, _destPath: string): Promise<void> {
    return Promise.reject(new Error('Not implemented'));
  }

  exists(path: string): Promise<boolean> {
    return Promise.resolve(this.files.has(path));
  }

  clear(): void {
    this.files.clear();
  }
}

class MockReadOnlyFileStore implements ReadOnlyFileStore {
  constructor(private files: Map<string, Buffer> = new Map()) {}

  read(path: string): Promise<Buffer> {
    const data = this.files.get(path);
    if (!data) {
      return Promise.reject(new Error(`File not found: ${path}`));
    }
    return Promise.resolve(data);
  }

  download(_pathOrUrl: string, _destPath: string): Promise<void> {
    return Promise.reject(new Error('Not implemented'));
  }

  exists(path: string): Promise<boolean> {
    return Promise.resolve(this.files.has(path));
  }

  setFile(path: string, data: Buffer): void {
    this.files.set(path, data);
  }
}

describe('FileStoreBlobClient', () => {
  const basePath = 'aztec-1-1-0x1234';
  let mockStore: MockFileStore;
  let client: FileStoreBlobClient;

  beforeEach(() => {
    mockStore = new MockFileStore();
    client = new FileStoreBlobClient(mockStore, basePath);
  });

  describe('saveBlob', () => {
    it('should save a blob to the filestore', async () => {
      const blob = await Blob.fromFields([Fr.random(), Fr.random()]);
      const versionedHash = `0x${blob.getEthVersionedBlobHash().toString('hex')}`;

      await client.saveBlob(blob);

      const exists = await mockStore.exists(`${basePath}/blobs/${versionedHash}.data`);
      expect(exists).toBe(true);

      const data = await mockStore.read(`${basePath}/blobs/${versionedHash}.data`);
      const json = JSON.parse(inboundTransform(data).toString());
      expect(json.kzg_commitment).toBe(`0x${blob.commitment.toString('hex')}`);
    });

    it('should skip saving if blob already exists and skipIfExists=true', async () => {
      const blob = await Blob.fromFields([Fr.random()]);
      const versionedHash = `0x${blob.getEthVersionedBlobHash().toString('hex')}`;

      // Save first time
      await client.saveBlob(blob);

      // Modify the stored data to detect if it gets overwritten
      const modifiedJson = JSON.stringify({ modified: true });
      await mockStore.save(`${basePath}/blobs/${versionedHash}.data`, Buffer.from(modifiedJson));

      // Save again with skipIfExists=true (default)
      await client.saveBlob(blob);

      // Should not be overwritten
      const data = await mockStore.read(`${basePath}/blobs/${versionedHash}.data`);
      expect(JSON.parse(data.toString()).modified).toBe(true);
    });

    it('should overwrite if skipIfExists=false', async () => {
      const blob = await Blob.fromFields([Fr.random()]);
      const versionedHash = `0x${blob.getEthVersionedBlobHash().toString('hex')}`;

      // Save first time
      await client.saveBlob(blob);

      // Modify the stored data
      const modifiedJson = JSON.stringify({ modified: true });
      await mockStore.save(`${basePath}/blobs/${versionedHash}.data`, Buffer.from(modifiedJson));

      // Save again with skipIfExists=false
      await client.saveBlob(blob, false);

      // Should be overwritten with original blob data
      const data = await mockStore.read(`${basePath}/blobs/${versionedHash}.data`);
      const json = JSON.parse(inboundTransform(data).toString());
      expect(json.modified).toBeUndefined();
      expect(json.kzg_commitment).toBe(`0x${blob.commitment.toString('hex')}`);
    });
  });

  describe('saveBlobs', () => {
    it('should save multiple blobs', async () => {
      const blob1 = await Blob.fromFields([Fr.random()]);
      const blob2 = await Blob.fromFields([Fr.random()]);

      await client.saveBlobs([blob1, blob2]);

      const hash1 = `0x${blob1.getEthVersionedBlobHash().toString('hex')}`;
      const hash2 = `0x${blob2.getEthVersionedBlobHash().toString('hex')}`;

      expect(await mockStore.exists(`${basePath}/blobs/${hash1}.data`)).toBe(true);
      expect(await mockStore.exists(`${basePath}/blobs/${hash2}.data`)).toBe(true);
    });
  });

  describe('getBlobsByHashes', () => {
    it('should retrieve blobs by their versioned hashes', async () => {
      const blob = await Blob.fromFields([Fr.random(), Fr.random()]);
      const versionedHash = `0x${blob.getEthVersionedBlobHash().toString('hex')}`;

      await client.saveBlob(blob);

      const blobs = await client.getBlobsByHashes([versionedHash]);

      expect(blobs.length).toBe(1);
      expect(blobs[0].kzg_commitment).toBe(`0x${blob.commitment.toString('hex')}`);
    });

    it('should return empty array for non-existent blob', async () => {
      const nonExistentHash = '0x' + 'ff'.repeat(32);
      const blobs = await client.getBlobsByHashes([nonExistentHash]);
      expect(blobs).toEqual([]);
    });

    it('should retrieve multiple blobs', async () => {
      const blob1 = await Blob.fromFields([Fr.random()]);
      const blob2 = await Blob.fromFields([Fr.random()]);

      await client.saveBlobs([blob1, blob2]);

      const hash1 = `0x${blob1.getEthVersionedBlobHash().toString('hex')}`;
      const hash2 = `0x${blob2.getEthVersionedBlobHash().toString('hex')}`;

      const blobs = await client.getBlobsByHashes([hash1, hash2]);

      expect(blobs.length).toBe(2);
    });

    it('should skip blobs that fail to parse', async () => {
      const blob = await Blob.fromFields([Fr.random()]);
      const hash = `0x${blob.getEthVersionedBlobHash().toString('hex')}`;

      // Save invalid JSON
      await mockStore.save(`${basePath}/blobs/${hash}.data`, Buffer.from('invalid json'));

      const blobs = await client.getBlobsByHashes([hash]);

      expect(blobs).toEqual([]);
    });
  });

  describe('exists', () => {
    it('should return true if blob exists', async () => {
      const blob = await Blob.fromFields([Fr.random()]);
      const versionedHash = `0x${blob.getEthVersionedBlobHash().toString('hex')}`;

      await client.saveBlob(blob);

      expect(await client.exists(versionedHash)).toBe(true);
    });

    it('should return false if blob does not exist', async () => {
      const nonExistentHash = '0x' + 'ff'.repeat(32);
      expect(await client.exists(nonExistentHash)).toBe(false);
    });
  });

  describe('getBaseUrl', () => {
    it('should return the base path', () => {
      expect(client.getBaseUrl()).toBe(basePath);
    });
  });

  describe('testConnection', () => {
    it('should return true when healthcheck file exists', async () => {
      await client.uploadHealthcheck();
      expect(await client.testConnection()).toBe(true);
    });

    it('should return false when healthcheck file does not exist', async () => {
      const freshStore = new MockFileStore();
      const freshClient = new FileStoreBlobClient(freshStore, basePath);
      expect(await freshClient.testConnection()).toBe(false);
    });

    it('should return false when store throws error', async () => {
      const failingStore: ReadOnlyFileStore = {
        read: () => Promise.reject(new Error('fail')),
        download: () => Promise.reject(new Error('fail')),
        exists: () => Promise.reject(new Error('fail')),
      };

      const failingClient = new FileStoreBlobClient(failingStore, basePath);
      expect(await failingClient.testConnection()).toBe(false);
    });
  });

  describe('read-only store', () => {
    it('should throw when trying to save to read-only store', async () => {
      const readOnlyStore = new MockReadOnlyFileStore();
      const readOnlyClient = new FileStoreBlobClient(readOnlyStore, basePath);

      const blob = await Blob.fromFields([Fr.random()]);

      await expect(readOnlyClient.saveBlob(blob)).rejects.toThrow('FileStore is read-only');
    });

    it('should be able to read from read-only store', async () => {
      const files = new Map<string, Buffer>();
      const blob = await Blob.fromFields([Fr.random()]);
      const versionedHash = `0x${blob.getEthVersionedBlobHash().toString('hex')}`;
      const path = `${basePath}/blobs/${versionedHash}.data`;

      files.set(path, outboundTransform(Buffer.from(JSON.stringify(blob.toJSON()))));

      const readOnlyStore = new MockReadOnlyFileStore(files);
      const readOnlyClient = new FileStoreBlobClient(readOnlyStore, basePath);

      const blobs = await readOnlyClient.getBlobsByHashes([versionedHash]);

      expect(blobs.length).toBe(1);
      expect(blobs[0].kzg_commitment).toBe(`0x${blob.commitment.toString('hex')}`);
    });
  });
});
