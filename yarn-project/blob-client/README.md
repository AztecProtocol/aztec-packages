## Blob Client

A client library for storing and retrieving blob data from various sources.

## When is this used?

The blob client is used by nodes to store and retrieve blob data that accompanies `propose` transactions on L1.

### Why?

Blob data is only available in the L1 consensus layer for a limited period (~3 weeks). The blob client provides a unified interface for:
- Fetching blobs from L1 consensus layer (beacon nodes)
- Storing/retrieving blobs from file stores (local files, S3, GCS)
- Caching blobs locally for faster access

### How?

The blob client supports multiple blob sources:
1. **File Store**: Local filesystem (`file://`), S3 (`s3://`), or GCS (`gs://`)
2. **L1 Consensus**: Beacon node API for recent blobs
3. **Archive**: Blobscan API for historical blobs

### Configurations

**File Store URLs** (`BLOB_FILE_STORE_URLS`):
Comma-separated list of URLs to read blobs from. Tried in order until blobs are found.

**File Store Upload URL** (`BLOB_FILE_STORE_UPLOAD_URL`):
URL for uploading blobs to a file store.

**L1 Consensus Host URLs** (`L1_CONSENSUS_HOST_URLS`):
Beacon node URLs for fetching recent blobs directly from L1.

**Archive API URL** (`BLOB_SINK_ARCHIVE_API_URL`):
Blobscan or similar archive API for historical blob data.

### Example Usage

```typescript
import { createBlobClient, createBlobClientWithFileStores } from '@aztec/blob-client/client';

// Simple client with L1 consensus and archive sources
const client = createBlobClient({
  l1ConsensusHostUrls: ['https://beacon.example.com'],
  archiveApiUrl: 'https://api.blobscan.com',
});

// Client with file store support
const clientWithFileStore = await createBlobClientWithFileStores({
  l1ChainId: 1,
  rollupVersion: 1,
  l1Contracts: { rollupAddress: { toString: () => '0x...' } },
  blobFileStoreUrls: ['s3://bucket/blobs', 'file:///local/blobs'],
  blobFileStoreUploadUrl: 's3://bucket/blobs',
});

// Fetch blobs
const blobs = await client.getBlobSidecar(blockHash, blobHashes);

// Upload blobs to file store
await client.sendBlobsToFilestore(blobs);
```
