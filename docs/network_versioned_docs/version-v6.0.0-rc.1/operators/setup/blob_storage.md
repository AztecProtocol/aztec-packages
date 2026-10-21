---
id: blob_storage
sidebar_position: 4
title: Blob retrieval
description: Learn how Aztec nodes retrieve blob data for L1 transactions.
displayed_sidebar: operatorsSidebar
references: ["yarn-project/blob-client/src/client/config.ts", "yarn-project/blob-client/src/client/factory.ts", "yarn-project/blob-client/src/filestore/*", "yarn-project/blob-client/src/archive/*"]
---

## Overview

Aztec uses EIP-4844 blobs to publish transaction data to Ethereum Layer 1. Since blob data is only available on L1 for a limited period (~18 days / 4,096 epochs), nodes need reliable ways to store and retrieve blob data for synchronization and historical access.

Aztec nodes can be configured to retrieve blobs from L1 consensus (beacon nodes), file stores (S3, GCS, R2), and archive services.

:::tip Automatic Configuration
When using `--network [NETWORK_NAME]`, blob file stores are automatically configured for you. Most users don't need to manually configure blob storage.
:::

:::warning Override Behavior
Setting the `BLOB_FILE_STORE_URLS` environment variable overrides the file store configuration from the network config.
:::

## Understanding blob sources

The blob client can retrieve blobs from multiple sources, tried in order:

1. **File Store**: Fast retrieval from configured storage (S3, GCS, R2, local files, HTTPS)
2. **L1 Consensus**: Beacon node API to a (semi-)supernode for recent blobs (within ~18 days)
3. **Archive API**: Services like Blobscan for historical blob data

For near-tip synchronization, the client will retry file stores with backoff to handle eventual consistency when blobs are still being uploaded by other validators.

### L1 consensus and blob availability

If your beacon node has access to [supernodes or semi-supernodes](https://ethereum.org/roadmap/fusaka/peerdas/), L1 consensus alone may be sufficient for retrieving blobs within the ~18 day retention period. With the Fusaka upgrade and [PeerDAS (Peer Data Availability Sampling)](https://eips.ethereum.org/EIPS/eip-7594), Ethereum uses erasure coding to split blobs into 128 columns, enabling robust data availability:

- **Supernodes** (validators with ≥4,096 ETH staked): Custody all 128 columns and all blob data for the full ~18 day retention period. These nodes form the backbone of the network and continuously heal data gaps.
- **Semi-supernodes** (validators with ≥1,824 ETH / 57 validators): Handle at least 64 columns, enabling reconstruction of complete blob data.
- **Regular nodes**: Only download 1/8th of the data (8 of 128 columns) to verify availability. This is **not sufficient** to serve complete blob data.

:::warning Supernodes
If L1 consensus is your only blob source, your beacon node must be a supernode or semi-supernode (or connected to one) to retrieve complete blobs. A regular node cannot reconstruct full blob data from its partial columns alone.
:::

This means that for recent blobs, configuring `L1_CONSENSUS_HOST_URLS` pointing to a well-connected supernode or semi-supernode may be all you need. However, file stores and archive APIs are still recommended for:
- Faster retrieval (file stores are typically faster than L1 consensus queries)
- Historical access (blobs older than ~18 days are pruned from L1)
- Redundancy (multiple sources improve reliability)

## Configuring blob sources

### Environment variables

Configure blob sources using environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `BLOB_FILE_STORE_URLS` | Comma-separated URLs to read blobs from | `gs://bucket/,s3://bucket/` |
| `L1_CONSENSUS_HOST_URLS` | Beacon node URLs (comma-separated) | `https://beacon.example.com` |
| `L1_CONSENSUS_HOST_API_KEYS` | API keys for beacon nodes | `key1,key2` |
| `L1_CONSENSUS_HOST_API_KEY_HEADERS` | Header names for API keys | `Authorization` |
| `BLOB_ARCHIVE_API_URL` | Archive API URL (e.g., Blobscan) | `https://api.blobscan.com` |
| `BLOB_ALLOW_EMPTY_SOURCES` | Allow no blob sources (default: false) | `false` |
| `BLOB_PREFER_FILESTORES` | Try file stores before consensus clients (default: false) | `false` |
| `BLOB_FILE_STORE_TIMEOUT_MS` | Timeout for HTTP requests to blob file stores in ms (default: 10000) | `10000` |

:::tip
If you want to contribute to the network by hosting a blob file store, see the [Blob upload guide](./blob_upload.md).
:::

### Supported storage backends

The blob client supports the same storage backends as snapshots:

- **Google Cloud Storage** - `gs://bucket-name/path/`
- **Amazon S3** - `s3://bucket-name/path/`
- **Cloudflare R2** - `s3://bucket-name/path/?endpoint=https://[ACCOUNT_ID].r2.cloudflarestorage.com`
- **HTTP/HTTPS** (read-only) - `https://host/path`
- **Local filesystem** - `file:///absolute/path`

### Storage path format

Blobs are stored using the following path structure:

```
{base_url}/aztec-{l1ChainId}-{rollupVersion}-{rollupAddress}/blobs/{versionedBlobHash}.data
```

For example:
```
gs://my-bucket/aztec-1-1-0x1234abcd.../blobs/0x01abc123...def.data
```

## Configuration examples

### Basic file store configuration

```bash
# Read blobs from GCS
BLOB_FILE_STORE_URLS=gs://my-snapshots/
```

### Multiple read sources with L1 fallback

```bash
# Try multiple sources in order
BLOB_FILE_STORE_URLS=gs://primary-bucket/,s3://backup-bucket/

# L1 consensus fallback
L1_CONSENSUS_HOST_URLS=https://beacon1.example.com,https://beacon2.example.com

# Archive fallback for historical blobs
BLOB_ARCHIVE_API_URL=https://api.blobscan.com
```

### Cloudflare R2 configuration

```bash
BLOB_FILE_STORE_URLS=s3://my-bucket/?endpoint=https://[ACCOUNT_ID].r2.cloudflarestorage.com
```

Replace `[ACCOUNT_ID]` with your Cloudflare account ID.

### Local filesystem (for testing)

```bash
BLOB_FILE_STORE_URLS=file:///data/blobs
```

## Authentication

### Google Cloud Storage

Set up [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials):

```bash
gcloud auth application-default login
```

Or use a service account key:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

### Amazon S3 / Cloudflare R2

Set AWS credentials as environment variables:

```bash
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
```

For R2, these credentials come from your Cloudflare R2 API tokens.

## How blob retrieval works

When a node needs blobs for a block, the blob client alternates between two primary sources in a retry loop, then falls back to the archive:

1. **Primary source A** (default: L1 Consensus) - Query supernode beacon nodes using slot number
2. **Primary source B** (default: File Store) - Quick lookup in configured file stores
3. If blobs are still missing, retry with backoff (handles eventual consistency)
4. **Archive API** - Final fallback (e.g., Blobscan)

The default order is consensus first, then file stores. Set `BLOB_PREFER_FILESTORES=true` to reverse this order if your file stores are more reliable or faster than your consensus clients.

Non-supernode consensus hosts are automatically detected at startup and skipped during blob fetching.

## Troubleshooting

### No blob sources configured

**Issue**: Node starts with warning about no blob sources.

**Solutions**:
- Configure at least one of: `BLOB_FILE_STORE_URLS`, `L1_CONSENSUS_HOST_URLS`, or `BLOB_ARCHIVE_API_URL`
- Set `BLOB_ALLOW_EMPTY_SOURCES=true` only if you understand the implications (node may fail to sync)

### Blob retrieval fails

**Issue**: Node cannot retrieve blobs for a block.

**Solutions**:
- Verify your file store URLs are accessible
- Check L1 consensus host connectivity
- Ensure authentication credentials are configured
- Try using multiple file store URLs for redundancy

### L1 consensus host errors

**Issue**: Cannot connect to beacon nodes.

**Solutions**:
- Verify beacon node URLs are correct and accessible
- Check if API keys are required and correctly configured
- Ensure the beacon node is synced
- Try multiple beacon node URLs for redundancy

## Best practices

- **Configure multiple sources**: Use multiple file store URLs and L1 consensus hosts for redundancy
- **Use file stores for production**: File stores provide faster, more reliable blob retrieval than L1 consensus
- **Use archive API for historical access**: Configure `BLOB_ARCHIVE_API_URL` for accessing blobs older than ~18 days. Even with PeerDAS supernodes providing robust data availability, blob data is pruned from L1 after 4,096 epochs. Archive services like [Blobscan](https://blobscan.com/) store historical blob data indefinitely

## Next Steps

- Learn how to [host a blob file store](./blob_upload.md) to contribute to the network
- Learn about [using snapshots](./syncing_best_practices) for faster node synchronization
- Set up [monitoring](../monitoring/index.md) to track your node's blob retrieval
- Check the [CLI reference](../reference/cli-reference.md) for additional blob-related options
- Join the [Aztec Discord](https://discord.gg/aztec) for support
