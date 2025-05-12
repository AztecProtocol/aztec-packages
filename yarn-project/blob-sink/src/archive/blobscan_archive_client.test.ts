import { hexToBuffer } from '@aztec/foundation/string';
import { fileURLToPath } from '@aztec/foundation/url';

import { jest } from '@jest/globals';
import { readFile } from 'fs/promises';
import { join } from 'path';

import { BlobscanArchiveClient } from './blobscan_archive_client.js';

describe('blobscan_archive_client', () => {
  let client: BlobscanArchiveClient;
  let data: any;
  let response: Response;
  let spy: jest.SpiedFunction<typeof fetch>;

  const blobId = '0xb32d173d17b2b9435d8280f6dd780048e851a1f89dd0441889899a79a9274d1377d5b94d27440ad55a68d826fc836c53';
  const blockId = '0x7d81980a40426c40544f0f729ada953be406730b877b5865d6cdc35cc8f9c84e';
  const headers = { accept: 'application/json' };

  const setResponse = (responseData: any, status = 200) => {
    data = responseData;
    response = { status, json: () => Promise.resolve(data) } as Response;
  };

  const loadResponse = async (fixture: string) => {
    setResponse(JSON.parse(await readFile(join(fileURLToPath(import.meta.url), '..', 'fixtures', fixture), 'utf-8')));
  };

  beforeAll(() => {
    spy = jest.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(response));
  });

  afterAll(() => {
    spy.mockRestore();
  });

  beforeEach(() => {
    client = new BlobscanArchiveClient('https://api.blobscan.dev');
  });

  describe('getBlobData', () => {
    const expectedUrl = new URL(`https://api.blobscan.dev/blobs/${blobId}/data`);

    it('fetches blob data', async () => {
      await loadResponse('blobscan_get_blob_data.json');
      const blobData = await client.getBlobData(blobId);

      expect(blobData).toHaveLength(128 * 1024);
      expect(blobData).toEqual(hexToBuffer(data));
      expect(spy).toHaveBeenCalledWith(expectedUrl, { headers });
    });

    it('returns undefined if not found', async () => {
      setResponse({ error: { message: 'Block not found', code: 'NOT_FOUND' } }, 404);

      const blobData = await client.getBlobData(blobId);
      expect(blobData).toBeUndefined();
      expect(spy).toHaveBeenCalledWith(expectedUrl, { headers });
    });
  });

  describe('getBlobsFromBlock', () => {
    const expectedUrl = new URL(`https://api.blobscan.dev/blocks/${blockId}?type=canonical&expand=blob%2Cblob_data`);

    it('fetches blobs from block', async () => {
      await loadResponse('blobscan_get_block.json');

      const blobs = await client.getBlobsFromBlock(blockId);
      expect(blobs).toHaveLength(2);

      expect(hexToBuffer(blobs![0].blob)).toHaveLength(128 * 1024);
      expect(hexToBuffer(blobs![1].blob)).toHaveLength(128 * 1024);

      expect(spy).toHaveBeenCalledWith(expectedUrl, { headers });
    });

    it('returns undefined if not found', async () => {
      setResponse({ error: { message: 'Block not found', code: 'NOT_FOUND' } }, 404);

      const blobJsons = await client.getBlobsFromBlock(blockId);
      expect(blobJsons).toBeUndefined();
      expect(spy).toHaveBeenCalledWith(expectedUrl, { headers });
    });
  });
});
