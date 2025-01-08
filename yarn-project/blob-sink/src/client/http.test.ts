import { Blob } from '@aztec/foundation/blob';
import { Fr } from '@aztec/foundation/fields';

import { BlobSinkServer } from '../server/server.js';
import { runBlobSinkClientTests } from './blob-sink-client-tests.js';
import { HttpBlobSinkClient } from './http.js';

describe('HttpBlobSinkClient', () => {
  runBlobSinkClientTests(async () => {
    const server = new BlobSinkServer({
      port: 0,
    });
    await server.start();

    const client = new HttpBlobSinkClient(`http://localhost:${server.port}`);

    return {
      client,
      cleanup: async () => {
        await server.stop();
      },
    };
  });

  it('should handle server connection errors gracefully', async () => {
    const client = new HttpBlobSinkClient('http://localhost:12345'); // Invalid port
    const blob = Blob.fromFields([Fr.random()]);

    const success = await client.sendBlobsToBlobSink('0x1234', [blob]);
    expect(success).toBe(false);

    const retrievedBlobs = await client.getBlobSidecar('0x1234');
    expect(retrievedBlobs).toEqual([]);
  });
});
